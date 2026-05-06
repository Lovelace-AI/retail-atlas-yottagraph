import { computed, ref } from 'vue';

/**
 * Session-level telemetry ring buffer.
 *
 * Accumulates the cache_hit / elapsed_ms / endpoint of every fan-out
 * response the client sees in the current page session, capped at the
 * most-recent N. Used by the footer strip in `pages/index.vue` to surface
 * "cache: 3/5 hit · last fan-out 0.2s" without having to hit the
 * telemetry summary endpoint.
 *
 * For server-side aggregation across all users, see
 * `server/api/atlas/telemetry/summary.get.ts`.
 */

const RING_SIZE = 20;

export interface TelemetrySample {
    endpoint: 'area-context' | 'recipe:event-density' | 'recipe:opens-closes' | string;
    cache_hit: boolean;
    elapsed_ms: number;
    ts: number;
}

const _samples = ref<TelemetrySample[]>([]);

export function useAtlasTelemetry() {
    function record(sample: TelemetrySample): void {
        _samples.value = [..._samples.value.slice(-(RING_SIZE - 1)), sample];
    }

    const summary = computed(() => {
        const list = _samples.value;
        if (list.length === 0) {
            return { count: 0, cache_hit_rate: 0, last_ms: null, last_cache_hit: false };
        }
        const last = list[list.length - 1];
        const hits = list.filter((s) => s.cache_hit).length;
        return {
            count: list.length,
            cache_hit_rate: hits / list.length,
            last_ms: last.elapsed_ms,
            last_cache_hit: last.cache_hit,
        };
    });

    return {
        record,
        summary,
        samples: _samples,
    };
}
