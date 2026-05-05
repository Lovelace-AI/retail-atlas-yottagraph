import { ref, shallowRef } from 'vue';

/**
 * Elemental fan-out for a clicked area (PRD R6.1, simplified for Phase 1).
 *
 * Loads area-level events, articles, economic concepts, and per-active-
 * retailer events when a user pins an area. Cached per `(area_key,
 * retailers_hash)` for the lifetime of the page session — the full PRD
 * spec calls for a 1-hour Deno KV cache (R6.3) shared across users; that
 * graduates to a server-side cache when the Nitro fan-out endpoint lands.
 *
 * Phase 1 is a stub: it surfaces the shape of the panel and queries the
 * gateway only when an `area_neid` is available. Most areas in the
 * 30-retailer roster don't have NEIDs yet (the area-NEID expansion script
 * is on the Phase 1 backlog), so the panel falls back to "context unavailable
 * for this area" with a one-line "Resolve" CTA.
 */

export interface AreaContextData {
    area_events: ContextEvent[];
    area_articles: ContextArticle[];
    economic_concepts: ContextConcept[];
    retailer_events: Record<string, ContextEvent[]>;
    elapsed_ms: number;
    cache_hit: boolean;
}

export interface ContextEvent {
    neid: string;
    summary: string;
    ts?: string;
    kind?: string;
}

export interface ContextArticle {
    neid: string;
    title: string;
    publisher?: string;
    published_at?: string;
    url?: string;
}

export interface ContextConcept {
    neid: string;
    name: string;
}

interface CacheEntry {
    data: AreaContextData;
    fetched_at: number;
}

const _cache = shallowRef<Record<string, CacheEntry>>({});

export function useAreaContext() {
    const loading = ref(false);
    const error = ref<string | null>(null);
    const data = shallowRef<AreaContextData | null>(null);

    function cacheKey(area_neid: string | null, area_key: string, retailers: string[]): string {
        const r = [...retailers].sort().join(',');
        return `${area_key}|${area_neid ?? '-'}|${r}`;
    }

    async function load(opts: {
        area_key: string;
        area_neid: string | null;
        retailers: string[];
    }): Promise<void> {
        loading.value = true;
        error.value = null;
        const key = cacheKey(opts.area_neid, opts.area_key, opts.retailers);
        const cached = _cache.value[key];
        if (cached && Date.now() - cached.fetched_at < 60 * 60 * 1000) {
            data.value = { ...cached.data, cache_hit: true };
            loading.value = false;
            return;
        }

        try {
            if (!opts.area_neid) {
                // Phase 1 placeholder until expand-area-neids.ts runs.
                data.value = {
                    area_events: [],
                    area_articles: [],
                    economic_concepts: [],
                    retailer_events: {},
                    elapsed_ms: 0,
                    cache_hit: false,
                };
                return;
            }
            // TODO(R6): wire the Nitro fan-out endpoint /api/atlas/area-context.
            // For Phase 1 we shape the data structure but leave the fan-out
            // unimplemented; the panel renders an "events coming soon" state
            // when the data arrays are empty.
            data.value = {
                area_events: [],
                area_articles: [],
                economic_concepts: [],
                retailer_events: {},
                elapsed_ms: 0,
                cache_hit: false,
            };
            _cache.value = {
                ..._cache.value,
                [key]: { data: data.value, fetched_at: Date.now() },
            };
        } catch (err) {
            error.value = (err as Error).message;
        } finally {
            loading.value = false;
        }
    }

    function reset(): void {
        loading.value = false;
        error.value = null;
        data.value = null;
    }

    return { load, reset, loading, error, data };
}
