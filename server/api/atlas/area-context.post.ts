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
    url?: string | null;
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
}

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
        const title = pickPropAny(r.properties, ['title', 'headline']);
        if (!title) continue;
        out.push({
            neid: r.neid ?? '',
            title,
            publisher: pickPropAny(r.properties, [
                'publisher',
                'original_publication_name',
                'source',
            ]),
            published_at: pickPropAny(r.properties, ['date', 'published_at', 'publication_date']),
            url: pickPropAny(r.properties, ['url', 'home_url', 'homeUrl', 'link']),
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

    const tool_calls: ToolCall[] = [];
    const t0 = Date.now();

    // Resolve per-retailer org NEIDs from the cache before opening the MCP
    // session — keeps the session window tight.
    const cache = loadRetailerNeidCache();
    const retailerOrgs = retailers
        .map((slug) => ({ slug, org_neid: cache[slug]?.neid ?? null }))
        .filter((r): r is { slug: string; org_neid: string } => !!r.org_neid);

    const result = await withElementalMcp(async (client) => {
        const eventsP = tracedToolCall<ElementalGetEventsResult>(
            client,
            'events:area',
            'elemental_get_events',
            { entity: body.area_neid, limit: AREA_EVENT_LIMIT },
            tool_calls
        );
        const articlesP = tracedToolCall<ElementalGetRelatedResult>(
            client,
            'related:articles',
            'elemental_get_related',
            {
                entity: body.area_neid,
                related_flavor: 'article',
                related_properties: ['title', 'date', 'url', 'publisher'],
                limit: ARTICLE_LIMIT,
            },
            tool_calls
        );
        const conceptsP = tracedToolCall<ElementalGetRelatedResult>(
            client,
            'related:concepts',
            'elemental_get_related',
            {
                entity: body.area_neid,
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
        elapsed_ms: Date.now() - t0,
        tool_calls,
    };
});
