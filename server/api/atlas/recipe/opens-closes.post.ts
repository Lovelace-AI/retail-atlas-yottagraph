/**
 * POST /api/atlas/recipe/opens-closes — R7.2.
 *
 * For each active retailer with a resolved `org_neid`, fan out
 * `elemental_get_events(org_neid, time_range, limit: 100, include_participants:
 * true)` and classify each event as an open (+1), close (-1), or neither (0)
 * via:
 *
 *   1. Category exact-match (small list — see OPEN_CATEGORIES /
 *      CLOSE_CATEGORIES below; lifted from data/probes/event-categories-*.md).
 *   2. Keyword regex on `name + description` as fallback (mutually
 *      exclusive — first match wins, close-match takes precedence over open
 *      since the close patterns are more specific).
 *
 * Event-to-area attribution: scan `participants[]` for `flavor === 'location'`
 * matches against the country's `areas.json`. If an event has multiple
 * location participants, each gets the signal credited (small but real
 * Wisconsin-style problem; matches the PRD's intent of "attributed to the
 * area via the store's `area_code`").
 *
 * Diverging-around-zero color scale: reds = net closures, greens = net opens.
 *
 * Honest-signal disclaimer: per the step-3a probe, retailer event feeds
 * include events about competing retailers, product launches, and
 * non-store closures (DCs, fulfillment centers, etc.). The recipe ships
 * with these caveats and the legend renders a "rough signal" notice
 * when active.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import type {
    AreaRecord,
    Country,
    RecipeAreaScore,
    RecipeResult,
    RecipeToolCall,
} from '../../../../types/retail';
import { kvKeyFor, logToolCalls, withKvCache } from '../../../utils/atlasKv';
import { unwrapToolResult, withElementalMcp } from '../../../utils/elementalMcp';

interface RequestBody {
    country: Country;
    retailers: string[];
    time_window: '30' | '90' | '365' | 'all';
}

interface RetailerNeidEntry {
    neid: string | null;
    name: string | null;
    score: number | null;
}

interface MCPParticipant {
    neid?: string;
    name?: string;
    /** Note: the actual MCP payload does NOT include `flavor` on participants
     *  (verified against elemental_get_events with include_participants=true).
     *  We attribute via NEID zero-padded match against areas.json regardless
     *  of declared flavor. */
    properties?: {
        role?: { value?: string };
        sentiment?: { value?: number };
    };
}

interface MCPEvent {
    neid?: string;
    name?: string;
    flavor?: string;
    properties?: {
        category?: { value?: string };
        description?: { value?: string };
        date?: { value?: string };
        likelihood?: { value?: string };
    };
    participants?: MCPParticipant[];
}

interface MCPGetEventsResult {
    events?: MCPEvent[];
    total?: number;
}

const PER_RETAILER_LIMIT = 100;
const CONCURRENCY = 4;

// Sourced from data/probes/event-categories-*.md. Update in lockstep with
// the probe report when re-run. Only categories whose name itself looks
// open/close-shaped are listed here; the keyword regex below is the
// primary signal.
const OPEN_CATEGORIES: ReadonlyArray<string> = ['Launch of a new product'];
const CLOSE_CATEGORIES: ReadonlyArray<string> = [];

const OPEN_REGEX =
    /\b(open|opens|opened|opening|launch|launches|launched|launching|debut|debuted|new\s+location|new\s+store|grand\s+opening|reopen|reopens)\b/i;
const CLOSE_REGEX =
    /\b(close|closes|closed|closing|closure|shutter|shutters|liquidat|exit|exits|exited|wind\s+down|cease)\b/i;

let _areasCache: AreaRecord[] | null = null;
function loadAreas(): AreaRecord[] {
    if (_areasCache) return _areasCache;
    const path = join(process.cwd(), 'public', 'data', 'retail_atlas', 'areas.json');
    if (!existsSync(path)) {
        throw createError({
            statusCode: 500,
            statusMessage: 'opens-closes: areas.json missing — run npm run build:data first',
        });
    }
    _areasCache = JSON.parse(readFileSync(path, 'utf-8')) as AreaRecord[];
    return _areasCache;
}

let _retailerCache: Record<string, RetailerNeidEntry> | null = null;
function loadRetailerCache(): Record<string, RetailerNeidEntry> {
    if (_retailerCache) return _retailerCache;
    const path = join(process.cwd(), 'data', 'neid_cache', 'retailer_neids.json');
    if (!existsSync(path)) {
        _retailerCache = {};
        return _retailerCache;
    }
    try {
        _retailerCache = JSON.parse(readFileSync(path, 'utf-8'));
        return _retailerCache!;
    } catch {
        _retailerCache = {};
        return _retailerCache;
    }
}

function timeRangeFor(window: RequestBody['time_window']): { after?: string } | undefined {
    if (window === 'all') return undefined;
    const days = Number(window);
    if (!Number.isFinite(days)) return undefined;
    const after = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return { after };
}

/**
 * Classify a single event as +1 (open), -1 (close), or 0 (neither).
 * Close patterns are checked first so an article that mentions both an
 * opening and a closure ("Walmart opens new store while closing two
 * others") tilts toward the more specific close signal.
 */
function classify(e: MCPEvent): -1 | 0 | 1 {
    const cat = e.properties?.category?.value ?? '';
    if (CLOSE_CATEGORIES.includes(cat)) return -1;
    if (OPEN_CATEGORIES.includes(cat)) return 1;
    const text = `${e.name ?? ''} ${e.properties?.description?.value ?? ''}`;
    if (CLOSE_REGEX.test(text)) return -1;
    if (OPEN_REGEX.test(text)) return 1;
    return 0;
}

async function tracedToolCall(
    client: Client,
    label: string,
    args: Record<string, unknown>,
    tool_calls: RecipeToolCall[]
): Promise<MCPGetEventsResult | null> {
    const t0 = Date.now();
    try {
        const res = await client.callTool({ name: 'elemental_get_events', arguments: args });
        tool_calls.push({ tool: label, ms: Date.now() - t0, ok: !res.isError });
        if (res.isError) return null;
        return unwrapToolResult<MCPGetEventsResult>(res);
    } catch {
        tool_calls.push({ tool: label, ms: Date.now() - t0, ok: false });
        return null;
    }
}

export default defineEventHandler(async (event): Promise<RecipeResult> => {
    const body = (await readBody(event)) as RequestBody;
    if (!body || !body.country) {
        throw createError({ statusCode: 400, statusMessage: 'country required' });
    }
    const retailers = body.retailers ?? [];

    // Longer TTL than R7.1 (which uses 1 h) — opens/closes signal evolves
    // more slowly, and at concurrency 4 the fan-out itself is cheaper since
    // we hit one tool per retailer not one per area.
    const cacheKey = kvKeyFor('recipe:opens-closes', {
        country: body.country,
        retailers,
        time_window: body.time_window,
    });

    const t0 = Date.now();
    const { data, cache_hit, cache_age_ms } = await withKvCache<RecipeResult>(
        { key: cacheKey, ttlSeconds: 6 * 60 * 60 },
        async () => runOpensCloses(body, retailers)
    );

    void logToolCalls({
        ts: new Date().toISOString(),
        endpoint: 'recipe:opens-closes',
        request: {
            country: body.country,
            time_window: body.time_window,
            retailers: [...retailers].sort(),
            retailer_count: retailers.length,
        },
        cache_hit,
        cache_age_ms,
        tool_calls: data.tool_calls ?? [],
        total_ms: Date.now() - t0,
    });

    return { ...data, cache_hit, cache_age_ms };
});

async function runOpensCloses(body: RequestBody, retailers: string[]): Promise<RecipeResult> {
    const tool_calls: RecipeToolCall[] = [];

    // Look up org_neids for the active retailers.
    const cache = loadRetailerCache();
    const targets = retailers
        .map((slug) => ({ slug, org_neid: cache[slug]?.neid ?? null }))
        .filter((r): r is { slug: string; org_neid: string } => !!r.org_neid);

    if (targets.length === 0) {
        return {
            recipe: 'opens_minus_closes',
            generated_at: new Date().toISOString(),
            scale: 'diverging',
            domain: [-1, 1],
            midpoint: 0,
            scores: [],
            tool_calls,
        };
    }

    // Build a fast NEID → AreaRecord lookup for the active country so we can
    // attribute events via participant matches in O(1). NEIDs are stored
    // 20-char zero-padded in areas.json; participant NEIDs from MCP arrive
    // unpadded (18-19 chars). We pad before lookup.
    const allAreas = loadAreas();
    const areaByNeid = new Map<string, AreaRecord>();
    /** Lowercase area name → AreaRecord, for description-text fallback when
     *  events don't carry a county-level participant (most retailer-level
     *  events don't). Multiple areas can share a name (e.g. "Springfield"
     *  exists in many states); the map keeps the last write. */
    const areaByLowerName = new Map<string, AreaRecord>();
    for (const a of allAreas) {
        if (a.country !== body.country) continue;
        if (a.neid) areaByNeid.set(a.neid, a);
        if (a.area_name) areaByLowerName.set(a.area_name.toLowerCase(), a);
    }
    function padNeid(neid: string): string {
        return neid.padStart(20, '0');
    }

    const timeRange = timeRangeFor(body.time_window);

    // Per-area accumulators: opens, closes
    const opens = new Map<string, number>();
    const closes = new Map<string, number>();
    const inc = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1);

    // Fan out one MCP session, all retailers in parallel up to CONCURRENCY.
    await withElementalMcp(async (client) => {
        const queue = targets.slice();
        const workers: Promise<void>[] = [];
        for (let w = 0; w < CONCURRENCY; w++) {
            workers.push(
                (async () => {
                    while (true) {
                        const t = queue.shift();
                        if (!t) return;
                        const args: Record<string, unknown> = {
                            entity: t.org_neid,
                            limit: PER_RETAILER_LIMIT,
                            include_participants: true,
                        };
                        if (timeRange) args.time_range = timeRange;
                        const r = await tracedToolCall(
                            client,
                            `events:retailer:${t.slug}`,
                            args,
                            tool_calls
                        );
                        for (const ev of r?.events ?? []) {
                            const sig = classify(ev);
                            if (sig === 0) continue;
                            const matchedAreas = new Set<string>();

                            // Primary attribution: zero-pad participant NEIDs
                            // and look up against the country's area map.
                            // Drops the `flavor` filter — the MCP participant
                            // payload doesn't carry flavor, and area NEIDs
                            // are globally unique so a match here is correct
                            // regardless.
                            for (const p of ev.participants ?? []) {
                                if (!p.neid) continue;
                                const a = areaByNeid.get(padNeid(p.neid));
                                if (a) matchedAreas.add(a.area_key);
                            }

                            // Description-text fallback was tested and trips
                            // a major false-positive class: "McDonald's" the
                            // brand collides with "McDonald County, MO" any
                            // time the event mentions the company by name
                            // (and similarly for Lake/Hill/King/Polk-style
                            // common county names). We trade sparser but
                            // trustworthy signal over false-positive noise.
                            // Re-enable once we have proper area NER (Phase
                            // 1.5+).

                            for (const ak of matchedAreas) {
                                if (sig === 1) inc(opens, ak);
                                else inc(closes, ak);
                            }
                        }
                    }
                })()
            );
        }
        await Promise.all(workers);
    });

    // Build scores. Domain mirrored about zero so the midpoint is centered.
    const scores: RecipeAreaScore[] = [];
    let maxAbs = 0;
    const keys = new Set<string>([...opens.keys(), ...closes.keys()]);
    for (const ak of keys) {
        const o = opens.get(ak) ?? 0;
        const c = closes.get(ak) ?? 0;
        const score = o - c;
        if (score === 0 && o === 0 && c === 0) continue;
        if (Math.abs(score) > maxAbs) maxAbs = Math.abs(score);
        scores.push({
            area_key: ak,
            score,
            numerator: o,
            denominator: c,
        });
    }

    return {
        recipe: 'opens_minus_closes',
        generated_at: new Date().toISOString(),
        scale: 'diverging',
        domain: [-(maxAbs || 1), maxAbs || 1],
        midpoint: 0,
        scores,
        tool_calls,
    };
}
