import { ref, shallowRef } from 'vue';

/**
 * Read-side fetcher for `GET /api/atlas/telemetry/summary?hours=N`.
 *
 * Auth-gated by Auth0 cookie at the route level — anonymous calls return
 * 401. The composable surfaces `loading`, `error`, and the parsed body.
 * Refresh manually via `load()`; no auto-poll today (admin pages are
 * lightly trafficked and analysts hit refresh on their own).
 */

interface EndpointBucket {
    count: number;
    cache_hit_rate: number;
    p50_ms: number;
    p95_ms: number;
}

interface RawRecord {
    ts: string;
    endpoint: string;
    request: {
        country?: string;
        time_window?: string;
        retailer_count?: number;
        retailers?: string[];
    };
    cache_hit: boolean;
    cache_age_ms: number | null;
    total_ms: number;
    tool_calls: { tool: string; ms: number; ok: boolean }[];
}

export interface TelemetrySummary {
    window_hours: number;
    generated_at: string;
    count: number;
    cache_hit_rate: number;
    p50_ms: number;
    p95_ms: number;
    by_endpoint: Record<string, EndpointBucket>;
    by_country: Record<string, { count: number }>;
    top_retailers: Array<{ slug: string; count: number }>;
    recent: RawRecord[];
}

export function useTelemetrySummary() {
    const data = shallowRef<TelemetrySummary | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);

    async function load(hours = 24): Promise<void> {
        loading.value = true;
        error.value = null;
        try {
            data.value = await $fetch<TelemetrySummary>(
                `/api/atlas/telemetry/summary?hours=${encodeURIComponent(hours)}`
            );
        } catch (err) {
            const message = (err as Error).message ?? 'Telemetry fetch failed';
            error.value = message;
        } finally {
            loading.value = false;
        }
    }

    return { data, loading, error, load };
}
