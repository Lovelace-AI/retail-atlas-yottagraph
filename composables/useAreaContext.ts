import { ref, shallowRef } from 'vue';

/**
 * Elemental fan-out for a clicked area (PRD R6.1).
 *
 * Loads area-level events, articles, economic concepts, and per-active-
 * retailer events when a user pins an area. Cached per `(area_key,
 * retailers_hash)` for the lifetime of the page session. The Nitro
 * `/api/atlas/area-context` endpoint runs the actual MCP fan-out via the
 * Lovelace gateway; this composable just hands off the request and caches.
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
    ts?: string | null;
    kind?: string | null;
    likelihood?: string | null;
}

export interface ContextArticle {
    neid: string;
    title: string;
    publisher?: string | null;
    published_at?: string | null;
    url?: string | null;
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
                // Area NEID hasn't been resolved yet (`npm run expand:areas`
                // hasn't run for this area). Surface a stub so the panel
                // can render the "context unavailable" state.
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
                return;
            }

            const res = await $fetch<{
                area_events: ContextEvent[];
                area_articles: ContextArticle[];
                economic_concepts: ContextConcept[];
                retailer_events: Record<string, ContextEvent[]>;
                elapsed_ms: number;
            }>('/api/atlas/area-context', {
                method: 'POST',
                body: {
                    area_neid: opts.area_neid,
                    area_key: opts.area_key,
                    retailers: opts.retailers,
                },
            });
            data.value = {
                area_events: res.area_events ?? [],
                area_articles: res.area_articles ?? [],
                economic_concepts: res.economic_concepts ?? [],
                retailer_events: res.retailer_events ?? {},
                elapsed_ms: res.elapsed_ms ?? 0,
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
