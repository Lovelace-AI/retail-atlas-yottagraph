/**
 * POST /api/atlas/recipe/event-density — R7.1.
 *
 * For each of the top-K areas (by total store count) in the requested country
 * with a resolved Elemental NEID and at least one active-retailer store,
 * fan out `elemental_get_events(area_neid, time_range, limit: 50)` and score
 * each area as `events_per_store = events.length / total_stores`.
 *
 * Diverging-around-median color scale so the visual midpoint is "typical
 * density"; areas substantially above/below pop. Domain capped at the 95th
 * percentile so a single outlier doesn't flatten the ramp.
 *
 * Top-K substitutes "viewport-clipped" since the canvas is currently
 * fit-to-country (no zoom). When zoom lands, swap K-by-store-count for an
 * actual viewport bbox filter; the response shape stays identical.
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

const TOP_K = 100;
const CONCURRENCY = 4;
const PER_AREA_LIMIT = 50;

interface MCPGetEventsResult {
    events?: Array<{
        neid?: string;
        properties?: Record<string, { value?: unknown } | undefined>;
    }>;
    total?: number;
}

let _areasCache: AreaRecord[] | null = null;
function loadAreas(): AreaRecord[] {
    if (_areasCache) return _areasCache;
    const path = join(process.cwd(), 'public', 'data', 'retail_atlas', 'areas.json');
    if (!existsSync(path)) {
        throw createError({
            statusCode: 500,
            statusMessage: 'event-density: areas.json missing — run npm run build:data first',
        });
    }
    _areasCache = JSON.parse(readFileSync(path, 'utf-8')) as AreaRecord[];
    return _areasCache;
}

function timeRangeFor(window: RequestBody['time_window']): { after?: string } | undefined {
    if (window === 'all') return undefined;
    const days = Number(window);
    if (!Number.isFinite(days)) return undefined;
    const after = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return { after };
}

function p95(values: number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
}

function median(values: number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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

/**
 * Run a list of async tasks in flights of `concurrency` workers.
 * Order-preserving — `out[i]` corresponds to `tasks[i]`.
 */
async function flightedMap<T, R>(
    items: T[],
    concurrency: number,
    fn: (t: T, i: number) => Promise<R>
): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let cursor = 0;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < concurrency; w++) {
        workers.push(
            (async () => {
                while (true) {
                    const idx = cursor++;
                    if (idx >= items.length) return;
                    out[idx] = await fn(items[idx], idx);
                }
            })()
        );
    }
    await Promise.all(workers);
    return out;
}

export default defineEventHandler(async (event): Promise<RecipeResult> => {
    const body = (await readBody(event)) as RequestBody;
    if (!body || !body.country) {
        throw createError({ statusCode: 400, statusMessage: 'country required' });
    }
    const retailers = body.retailers ?? [];

    const cacheKey = kvKeyFor('recipe:event-density', {
        country: body.country,
        retailers,
        time_window: body.time_window,
    });

    const t0 = Date.now();
    const { data, cache_hit, cache_age_ms } = await withKvCache<RecipeResult>(
        { key: cacheKey, ttlSeconds: 60 * 60 },
        async () => runEventDensity(body, retailers)
    );

    void logToolCalls({
        ts: new Date().toISOString(),
        endpoint: 'recipe:event-density',
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

async function runEventDensity(body: RequestBody, retailers: string[]): Promise<RecipeResult> {
    const tool_calls: RecipeToolCall[] = [];

    // 1. Pick the top-K areas. Must have NEID + at least one active retailer
    //    with stores > 0.
    const allAreas = loadAreas();
    const candidates = allAreas
        .filter((a) => a.country === body.country && !!a.neid && a.total_stores > 0)
        .filter((a) => {
            if (retailers.length === 0) return true;
            for (const slug of retailers) {
                if ((a.store_counts_by_retailer[slug] ?? 0) > 0) return true;
            }
            return false;
        })
        .sort((a, b) => b.total_stores - a.total_stores)
        .slice(0, TOP_K);

    if (candidates.length === 0) {
        return {
            recipe: 'event_density',
            generated_at: new Date().toISOString(),
            scale: 'diverging',
            domain: [-1, 1],
            midpoint: 0,
            scores: [],
            tool_calls,
            truncated: false,
        };
    }

    const timeRange = timeRangeFor(body.time_window);

    // 2. Fan out via one MCP session.
    const eventsPerArea = await withElementalMcp(async (client) => {
        return flightedMap(candidates, CONCURRENCY, async (a, i) => {
            const args: Record<string, unknown> = {
                entity: a.neid as string,
                limit: PER_AREA_LIMIT,
            };
            if (timeRange) args.time_range = timeRange;
            const r = await tracedToolCall(client, `events:${i}:${a.area_key}`, args, tool_calls);
            const count = r?.events?.length ?? 0;
            return { area: a, count };
        });
    });

    // 3. Score = events / total_stores. Compute domain stats around the median
    //    so "typical density" sits at the visual midpoint.
    const rawScores: { area: AreaRecord; score: number; count: number }[] = [];
    for (const { area: a, count } of eventsPerArea) {
        if (a.total_stores <= 0) continue;
        rawScores.push({ area: a, score: count / a.total_stores, count });
    }
    const scoreValues = rawScores.map((r) => r.score);
    const med = median(scoreValues);
    const top = p95(scoreValues);
    const lo = Math.min(0, 2 * med - top); // mirror domain about median
    const domain: [number, number] = [lo, top || 1];

    const scores: RecipeAreaScore[] = rawScores.map(({ area, score, count }) => ({
        area_key: area.area_key,
        score,
        numerator: count,
        denominator: area.total_stores,
    }));

    return {
        recipe: 'event_density',
        generated_at: new Date().toISOString(),
        scale: 'diverging',
        domain,
        midpoint: med,
        scores,
        tool_calls,
        truncated: candidates.length >= TOP_K,
    };
}
