/**
 * GET /api/atlas/telemetry/summary?hours=24 — R-007 read-side aggregator.
 *
 * Walks the capped telemetry list (`atlas:tel:v1`) populated by
 * `logToolCalls()` in the fan-out endpoints. Computes session-level
 * aggregations: count, cache_hit_rate, p50 / p95 latency, breakdowns by
 * endpoint / country / retailer.
 *
 * Auth: Auth0 cookie required (same gate as the rest of the atlas) so
 * raw telemetry isn't anonymously enumerable. The summary is bounded
 * (≤ 10 000 entries × ~500 B = ~5 MB), and aggregation is O(N) over a
 * single LRANGE; safe to call repeatedly.
 */

import { unsealCookie } from '../../../utils/cookies';
import { readToolCalls, type TelemetryRecord } from '../../../utils/atlasKv';

interface EndpointBucket {
    count: number;
    cache_hit_rate: number;
    p50_ms: number;
    p95_ms: number;
}

interface TelemetrySummary {
    window_hours: number;
    generated_at: string;
    count: number;
    cache_hit_rate: number;
    p50_ms: number;
    p95_ms: number;
    by_endpoint: Record<string, EndpointBucket>;
    by_country: Record<string, { count: number }>;
    top_retailers: Array<{ slug: string; count: number }>;
    /** Most-recent N raw entries for ad-hoc inspection (panel footer / admin
     *  view). Capped at 50 to keep responses small. */
    recent: TelemetryRecord[];
}

function quantile(values: number[], q: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * q));
    return sorted[idx];
}

function aggregate(records: TelemetryRecord[], hours: number): TelemetrySummary {
    const cutoff = Date.now() - hours * 60 * 60 * 1000;
    const recent = records.filter((r) => Date.parse(r.ts) >= cutoff);

    const all_ms = recent.map((r) => r.total_ms);
    const cache_hits = recent.filter((r) => r.cache_hit).length;

    const by_endpoint: Record<string, TelemetryRecord[]> = {};
    const by_country: Record<string, number> = {};
    const retailer_counts = new Map<string, number>();

    for (const r of recent) {
        const k = r.endpoint;
        (by_endpoint[k] ??= []).push(r);
        const c = r.request?.country;
        if (c) by_country[c] = (by_country[c] ?? 0) + 1;
        for (const slug of r.request?.retailers ?? []) {
            retailer_counts.set(slug, (retailer_counts.get(slug) ?? 0) + 1);
        }
    }

    const endpointBuckets: Record<string, EndpointBucket> = {};
    for (const [k, arr] of Object.entries(by_endpoint)) {
        const ms = arr.map((r) => r.total_ms);
        const hits = arr.filter((r) => r.cache_hit).length;
        endpointBuckets[k] = {
            count: arr.length,
            cache_hit_rate: arr.length > 0 ? hits / arr.length : 0,
            p50_ms: quantile(ms, 0.5),
            p95_ms: quantile(ms, 0.95),
        };
    }

    const top_retailers = [...retailer_counts.entries()]
        .map(([slug, count]) => ({ slug, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

    return {
        window_hours: hours,
        generated_at: new Date().toISOString(),
        count: recent.length,
        cache_hit_rate: recent.length > 0 ? cache_hits / recent.length : 0,
        p50_ms: quantile(all_ms, 0.5),
        p95_ms: quantile(all_ms, 0.95),
        by_endpoint: endpointBuckets,
        by_country: Object.fromEntries(
            Object.entries(by_country).map(([k, v]) => [k, { count: v }])
        ),
        top_retailers,
        recent: recent.slice(0, 50),
    };
}

export default defineEventHandler(async (event): Promise<TelemetrySummary> => {
    const cookie = await unsealCookie(event);
    if (!cookie?.user) {
        throw createError({ statusCode: 401, statusMessage: 'Authentication required' });
    }

    const query = getQuery(event);
    const hoursRaw = Number(query.hours ?? 24);
    const hours = Number.isFinite(hoursRaw) && hoursRaw > 0 ? Math.min(hoursRaw, 720) : 24;

    const records = await readToolCalls();
    return aggregate(records, hours);
});
