import { createHash } from 'node:crypto';

import { getRedis } from './redis';

/**
 * Atlas KV — server-side caching + telemetry log on top of the existing
 * Upstash Redis instance.
 *
 * Both helpers degrade gracefully when KV is not configured (`getRedis()`
 * returns null). Recipes still compute, just without cache hits or logs.
 *
 * Cache key prefix is versioned so we can invalidate by bumping it after
 * a `npm run expand:retailers` re-run or schema change.
 *
 * Telemetry list key is also versioned, capped via LTRIM after each push,
 * so memory is bounded.
 */

const CACHE_PREFIX = 'atlas:cache:v1';
const TELEMETRY_LIST = 'atlas:tel:v1';
const TELEMETRY_MAX_ENTRIES = 10_000;

export interface KvCacheOptions {
    /** Stable cache key. Hash high-cardinality inputs in `kvKeyFor` first. */
    key: string;
    ttlSeconds: number;
}

export interface KvCacheResult<T> {
    data: T;
    cache_hit: boolean;
    /** Milliseconds since the cached entry was written, or null on miss. */
    cache_age_ms: number | null;
}

interface CachedEnvelope<T> {
    data: T;
    written_at: number;
}

/**
 * Read-through Redis cache. On hit, returns the cached value with
 * `cache_hit: true`. On miss (or any KV error / KV-not-configured), runs
 * `fn()`, persists the result, and returns it with `cache_hit: false`.
 *
 * Errors from KV are logged but never thrown — the cache is best-effort
 * by design. The fan-out itself is the source of truth.
 */
export async function withKvCache<T>(
    opts: KvCacheOptions,
    fn: () => Promise<T>
): Promise<KvCacheResult<T>> {
    const redis = getRedis();
    if (!redis) {
        return { data: await fn(), cache_hit: false, cache_age_ms: null };
    }

    const key = `${CACHE_PREFIX}:${opts.key}`;
    try {
        // Upstash auto-deserializes JSON values when stored as strings.
        const cached = (await redis.get(key)) as CachedEnvelope<T> | null;
        if (cached && typeof cached.written_at === 'number') {
            return {
                data: cached.data,
                cache_hit: true,
                cache_age_ms: Date.now() - cached.written_at,
            };
        }
    } catch (err) {
        console.warn(`[atlasKv] cache read failed for ${key}: ${(err as Error).message}`);
    }

    const data = await fn();

    try {
        const envelope: CachedEnvelope<T> = { data, written_at: Date.now() };
        await redis.set(key, envelope, { ex: opts.ttlSeconds });
    } catch (err) {
        console.warn(`[atlasKv] cache write failed for ${key}: ${(err as Error).message}`);
    }

    return { data, cache_hit: false, cache_age_ms: null };
}

export type AtlasEndpoint = 'area-context' | 'recipe:event-density' | 'recipe:opens-closes';

export interface ToolCallEntry {
    tool: string;
    ms: number;
    ok: boolean;
}

export interface TelemetryRecord {
    ts: string;
    endpoint: AtlasEndpoint;
    /** Sanitized request — no full NEIDs, no per-area details. Aggregations
     *  use these dimensions; do NOT add user-identifying data. */
    request: {
        country?: string;
        time_window?: string;
        retailer_count?: number;
        retailers?: string[]; // sorted
    };
    cache_hit: boolean;
    cache_age_ms: number | null;
    tool_calls: ToolCallEntry[];
    total_ms: number;
    /** Hashed user identifier; not used today but plumbed for future
     *  per-user dashboards. */
    user_hint?: string | null;
}

/**
 * Append a telemetry record to a capped Upstash list. Fire-and-forget —
 * never blocks the response, never throws.
 */
export async function logToolCalls(record: TelemetryRecord): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    try {
        await redis.lpush(TELEMETRY_LIST, JSON.stringify(record));
        // Cap memory. LTRIM keeps the first N elements; with LPUSH+LTRIM we
        // retain the most recent N entries.
        await redis.ltrim(TELEMETRY_LIST, 0, TELEMETRY_MAX_ENTRIES - 1);
    } catch (err) {
        console.warn(`[atlasKv] telemetry write failed: ${(err as Error).message}`);
    }
}

/**
 * Read up to `count` recent telemetry entries (newest first).
 * Returns parsed records, dropping any malformed entries.
 */
export async function readToolCalls(count = TELEMETRY_MAX_ENTRIES): Promise<TelemetryRecord[]> {
    const redis = getRedis();
    if (!redis) return [];
    try {
        const raw = (await redis.lrange(TELEMETRY_LIST, 0, count - 1)) as Array<
            string | TelemetryRecord
        >;
        const out: TelemetryRecord[] = [];
        for (const entry of raw) {
            try {
                if (typeof entry === 'string') {
                    out.push(JSON.parse(entry) as TelemetryRecord);
                } else if (entry && typeof entry === 'object') {
                    // Upstash sometimes returns already-parsed objects.
                    out.push(entry as TelemetryRecord);
                }
            } catch {
                // Skip malformed.
            }
        }
        return out;
    } catch (err) {
        console.warn(`[atlasKv] telemetry read failed: ${(err as Error).message}`);
        return [];
    }
}

/**
 * Build a deterministic cache key for the atlas endpoints. Uses sha256 to
 * fold high-cardinality inputs (NEIDs, retailer lists) into a fixed-size
 * digest so the resulting Redis key never bumps the 1 KB key-length cap.
 */
export function kvKeyFor(route: AtlasEndpoint, body: Record<string, unknown>): string {
    // Normalize array-typed body fields so [a,b] and [b,a] hash the same.
    const normalized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
        if (Array.isArray(v)) {
            normalized[k] = [...v].map(String).sort();
        } else if (v !== undefined) {
            normalized[k] = v;
        }
    }
    const canon = JSON.stringify(normalized, Object.keys(normalized).sort());
    const digest = createHash('sha256').update(canon).digest('hex').slice(0, 24);
    return `${route}:${digest}`;
}
