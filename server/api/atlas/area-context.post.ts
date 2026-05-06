/**
 * POST /api/atlas/area-context — fans out a clicked area's NEID into the
 * Lovelace knowledge graph via the Elemental MCP server and returns the
 * data the AtlasContextPanel renders.
 *
 * Request body:
 *   {
 *     area_neid: string,            // 20-char zero-padded NEID
 *     area_key:  string,            // for caching / telemetry
 *     retailers: string[]           // active retailer slugs (per chip set)
 *   }
 *
 * Response body:
 *   {
 *     area_events:        ContextEvent[],
 *     area_articles:      ContextArticle[],
 *     economic_concepts:  ContextConcept[],
 *     retailer_events:    Record<string, ContextEvent[]>,
 *     elapsed_ms:         number,
 *     tool_calls:         { tool: string; ms: number; ok: boolean }[],
 *   }
 *
 * Implementation notes:
 *   - Uses the MCP transport (`server/utils/elementalMcp.ts`). One session
 *     opened per request, all tool calls run in parallel inside it, session
 *     closed before returning. Per-request lifecycle is the simplest model;
 *     panel-open latency is well within the PRD R3.4 8s error budget.
 *   - `elemental_get_events` is MCP-only (no REST equivalent). `_get_related`
 *     gets articles + economic concepts with the right properties already
 *     resolved (no PID hunting; PRD R6.1 step 2 + 3).
 *   - Per-retailer events (PRD R6.1 step 3) require an `org_neid` per
 *     retailer; we look it up in `data/neid_cache/retailer_neids.json`
 *     populated by `scripts/expand-retailer-neids.ts`. Slugs without a
 *     resolved org NEID return an empty event array under their slug key.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { kvKeyFor, logToolCalls, withKvCache } from '../../utils/atlasKv';
import { unwrapToolResult, withElementalMcp } from '../../utils/elementalMcp';

interface ContextEvent {
    neid: string;
    summary: string;
    ts?: string | null;
    kind?: string | null;
    likelihood?: string | null;
}

interface ContextArticle {
    neid: string;
    title: string;
    publisher?: string | null;
    published_at?: string | null;
    /** Article URL is intentionally absent — the Lovelace article schema
     *  (`elemental_get_schema(article)`) doesn't carry a URL property; the
     *  graph indexes title + publisher + dates + topic/tone signals only. */
    topic?: string | null;
    tone?: string | null;
    title_factuality?: string | null;
}

interface ContextConcept {
    neid: string;
    name: string;
}

interface ToolCall {
    tool: string;
    ms: number;
    ok: boolean;
}

interface AreaContextRequest {
    area_neid: string;
    area_key: string;
    retailers: string[];
}

interface AreaContextResponse {
    area_events: ContextEvent[];
    area_articles: ContextArticle[];
    economic_concepts: ContextConcept[];
    retailer_events: Record<string, ContextEvent[]>;
    elapsed_ms: number;
    tool_calls: ToolCall[];
    /** True when the response body came from Upstash KV (no MCP fan-out
     *  happened on this request). The composable still exposes its own
     *  session-level cache_hit; both can be true. */
    cache_hit: boolean;
    cache_age_ms: number | null;
}

/** What gets memoized in KV — everything except per-request bookkeeping. */
type AreaContextPayload = Omit<
    AreaContextResponse,
    'elapsed_ms' | 'tool_calls' | 'cache_hit' | 'cache_age_ms'
> & {
    /** Tool-call timing from the original fan-out, retained for ops insight
     *  on cache hits. Wall-clock latency in `elapsed_ms` is the live one. */
    fanout_tool_calls: ToolCall[];
};

const ARTICLE_LIMIT = 12;
const CONCEPT_LIMIT = 8;
const AREA_EVENT_LIMIT = 12;
const RETAILER_EVENT_LIMIT = 8;

interface RetailerNeidCacheEntry {
    neid: string | null;
    name: string | null;
    score: number | null;
    resolved_at: string;
}

let _retailerNeidCache: Record<string, RetailerNeidCacheEntry> | null = null;
let _retailerNeidCacheAt = 0;

function loadRetailerNeidCache(): Record<string, RetailerNeidCacheEntry> {
    // Cheap in-process cache; refreshed if file mtime changes (we re-read every 60s).
    const now = Date.now();
    if (_retailerNeidCache && now - _retailerNeidCacheAt < 60_000) {
        return _retailerNeidCache;
    }
    const path = join(process.cwd(), 'data', 'neid_cache', 'retailer_neids.json');
    if (!existsSync(path)) {
        _retailerNeidCache = {};
        _retailerNeidCacheAt = now;
        return _retailerNeidCache;
    }
    try {
        _retailerNeidCache = JSON.parse(readFileSync(path, 'utf-8'));
        _retailerNeidCacheAt = now;
        return _retailerNeidCache!;
    } catch (err) {
        console.warn(
            `[atlas-area-context] retailer_neids.json read failed: ${(err as Error).message}`
        );
        _retailerNeidCache = {};
        _retailerNeidCacheAt = now;
        return _retailerNeidCache;
    }
}

async function tracedToolCall<T>(
    client: Client,
    label: string,
    name: string,
    args: Record<string, unknown>,
    tool_calls: ToolCall[]
): Promise<T | null> {
    const t0 = Date.now();
    try {
        const res = await client.callTool({ name, arguments: args });
        tool_calls.push({ tool: label, ms: Date.now() - t0, ok: !res.isError });
        if (res.isError) {
            const text = (res as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? '';
            console.warn(`[atlas-area-context] ${label} returned isError: ${text.slice(0, 200)}`);
            return null;
        }
        return unwrapToolResult<T>(res);
    } catch (err) {
        console.warn(`[atlas-area-context] ${label} threw: ${(err as Error).message}`);
        tool_calls.push({ tool: label, ms: Date.now() - t0, ok: false });
        return null;
    }
}

/**
 * Lovelace property values arrive wrapped as `{ ref?: string, value: T }`.
 * `ref` is a citation pointer into the per-tool `_meta.lovelace/provenance`
 * map — useful for verifying provenance, not for rendering. We just want
 * `.value`.
 */
interface PropertyEnvelope {
    ref?: string;
    value?: unknown;
}

type PropertyMap = Record<string, PropertyEnvelope | undefined>;

interface MCPEvent {
    neid?: string;
    name?: string;
    flavor?: string;
    properties?: PropertyMap;
}

interface ElementalGetEventsResult {
    events?: MCPEvent[];
    total?: number;
}

interface MCPRelationship {
    neid?: string;
    name?: string;
    flavor?: string;
    relationship_types?: string[];
    properties?: PropertyMap;
}

interface ElementalGetRelatedResult {
    relationships?: MCPRelationship[];
    total?: number;
}

function propValue(props: PropertyMap | undefined, key: string): string | null {
    if (!props) return null;
    const env = props[key];
    if (!env) return null;
    const v = env.value;
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return v.trim() || null;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    // Defensive fallback — shouldn't trigger in practice.
    try {
        return JSON.stringify(v);
    } catch {
        return null;
    }
}

function pickPropAny(props: PropertyMap | undefined, keys: string[]): string | null {
    for (const k of keys) {
        const v = propValue(props, k);
        if (v) return v;
    }
    return null;
}

function mapEvents(payload: ElementalGetEventsResult | null): ContextEvent[] {
    const events = payload?.events ?? [];
    const out: ContextEvent[] = [];
    for (const e of events) {
        const headline = e.name?.trim();
        const description = propValue(e.properties, 'description');
        const summary = description ?? headline ?? '(event)';
        if (!summary || summary === '(event)') continue;
        out.push({
            neid: e.neid ?? '',
            summary,
            ts: propValue(e.properties, 'date'),
            kind: propValue(e.properties, 'category'),
            likelihood: propValue(e.properties, 'likelihood'),
        });
    }
    return out;
}

function mapArticles(payload: ElementalGetRelatedResult | null): ContextArticle[] {
    const rels = payload?.relationships ?? [];
    const out: ContextArticle[] = [];
    for (const r of rels) {
        // r.name is an opaque content-hash on article entities — never a
        // human-readable title. The display title lives in properties.title.value.
        const title = pickPropAny(r.properties, ['title']);
        if (!title) continue;
        out.push({
            neid: r.neid ?? '',
            title,
            publisher: pickPropAny(r.properties, ['original_publication_name']),
            published_at: pickPropAny(r.properties, ['published_at']),
            topic: pickPropAny(r.properties, ['has_topic']),
            tone: pickPropAny(r.properties, ['tone']),
            title_factuality: pickPropAny(r.properties, ['title_factuality']),
        });
    }
    return out;
}

function mapConcepts(payload: ElementalGetRelatedResult | null): ContextConcept[] {
    const rels = payload?.relationships ?? [];
    return rels
        .filter((r) => (r.name ?? '').length > 0)
        .map((r) => ({
            neid: r.neid ?? '',
            name: r.name ?? '(concept)',
        }));
}

export default defineEventHandler(async (event): Promise<AreaContextResponse> => {
    const body = (await readBody(event)) as AreaContextRequest;
    if (!body || !body.area_neid) {
        throw createError({ statusCode: 400, statusMessage: 'area_neid required' });
    }
    const retailers = body.retailers ?? [];

    const t0 = Date.now();

    // Resolve per-retailer org NEIDs from the cache before opening the MCP
    // session — keeps the session window tight. (This is the in-process
    // retailer-NEID lookup, separate from the KV cache below.)
    const cache = loadRetailerNeidCache();
    const retailerOrgs = retailers
        .map((slug) => ({ slug, org_neid: cache[slug]?.neid ?? null }))
        .filter((r): r is { slug: string; org_neid: string } => !!r.org_neid);

    const cacheKey = kvKeyFor('area-context', {
        area_neid: body.area_neid,
        retailers: retailerOrgs.map((r) => r.slug),
    });

    const { data, cache_hit, cache_age_ms } = await withKvCache<AreaContextPayload>(
        { key: cacheKey, ttlSeconds: 60 * 60 },
        async () => runAreaContextFanOut(body.area_neid, retailerOrgs)
    );

    const total_ms = Date.now() - t0;

    // Fire-and-forget telemetry (R-007). Never blocks the response.
    void logToolCalls({
        ts: new Date().toISOString(),
        endpoint: 'area-context',
        request: { retailers: [...retailers].sort(), retailer_count: retailers.length },
        cache_hit,
        cache_age_ms,
        tool_calls: data.fanout_tool_calls,
        total_ms,
    });

    return {
        ...data,
        elapsed_ms: total_ms,
        tool_calls: data.fanout_tool_calls,
        cache_hit,
        cache_age_ms,
    };
});

async function runAreaContextFanOut(
    area_neid: string,
    retailerOrgs: Array<{ slug: string; org_neid: string }>
): Promise<AreaContextPayload> {
    const tool_calls: ToolCall[] = [];
    const result = await withElementalMcp(async (client) => {
        const eventsP = tracedToolCall<ElementalGetEventsResult>(
            client,
            'events:area',
            'elemental_get_events',
            { entity: area_neid, limit: AREA_EVENT_LIMIT },
            tool_calls
        );
        const articlesP = tracedToolCall<ElementalGetRelatedResult>(
            client,
            'related:articles',
            'elemental_get_related',
            {
                entity: area_neid,
                related_flavor: 'article',
                // Property names per `elemental_get_schema(article)` — the
                // graph schema, not arbitrary names. Asking for unknowns
                // returns a `resolution.skipped` payload; asking for these
                // returns whatever each article actually has populated.
                related_properties: [
                    'title',
                    'published_at',
                    'original_publication_name',
                    'has_topic',
                    'tone',
                    'title_factuality',
                ],
                limit: ARTICLE_LIMIT,
            },
            tool_calls
        );
        const conceptsP = tracedToolCall<ElementalGetRelatedResult>(
            client,
            'related:concepts',
            'elemental_get_related',
            {
                entity: area_neid,
                related_flavor: 'economic_concept',
                limit: CONCEPT_LIMIT,
            },
            tool_calls
        );
        const retailerEventPromises = retailerOrgs.map(({ slug, org_neid }) =>
            tracedToolCall<ElementalGetEventsResult>(
                client,
                `events:retailer:${slug}`,
                'elemental_get_events',
                { entity: org_neid, limit: RETAILER_EVENT_LIMIT },
                tool_calls
            ).then((payload) => ({ slug, events: mapEvents(payload) }))
        );

        const [areaEvents, areaArticles, areaConcepts, retailerResults] = await Promise.all([
            eventsP,
            articlesP,
            conceptsP,
            Promise.all(retailerEventPromises),
        ]);

        const retailer_events: Record<string, ContextEvent[]> = {};
        for (const r of retailerResults) {
            retailer_events[r.slug] = r.events;
        }

        return {
            area_events: mapEvents(areaEvents),
            area_articles: mapArticles(areaArticles),
            economic_concepts: mapConcepts(areaConcepts),
            retailer_events,
        };
    });

    return {
        ...result,
        fanout_tool_calls: tool_calls,
    };
}
