import { computed, ref, shallowRef, watch } from 'vue';

import type {
    AreaRecord,
    Country,
    RecipeAreaScore,
    RecipeKey,
    RecipeResult,
    RetailerSummary,
} from '~/types/retail';

import { useAtlasData } from './useAtlasData';
import { useAtlasState } from './useAtlasState';
import { useAtlasTelemetry } from './useAtlasTelemetry';

/**
 * R7 — Analysis-recipe state and computation.
 *
 * Each recipe produces a `RecipeResult` whose `scores` map keys to a number
 * that drives the choropleth fill. R7.3 (co-occurrence) is pure client-side
 * arithmetic over `areas.json`. R7.1 (event density) and R7.2 (opens minus
 * closes) hit Nitro endpoints that fan out via the MCP transport.
 *
 * Module-level cache keyed by `(recipe, country, retailers_hash, time_window)`
 * for one hour — graduates to KV in PRD R6.3 follow-up.
 */

interface CacheEntry {
    data: RecipeResult;
    fetched_at: number;
}

const _cache = shallowRef<Record<string, CacheEntry>>({});
const _data = shallowRef<RecipeResult | null>(null);
const _loading = ref(false);
const _error = ref<string | null>(null);
const _cacheHit = ref(false);

function cacheKey(opts: {
    recipe: RecipeKey;
    country: Country;
    retailers: string[];
    timeWindow: string;
}): string {
    const r = [...opts.retailers].sort().join(',');
    return `${opts.recipe}|${opts.country}|${r}|${opts.timeWindow}`;
}

function p95(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
    return sorted[idx];
}

function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * R7.3 — Cross-retailer co-occurrence.
 *
 * For a primary retailer (the first active one), score every area by the
 * product of its store count and the sum of competing-retailer counts.
 * Pure arithmetic; no MCP calls.
 */
function computeCoOccurrence(
    areas: AreaRecord[],
    activeRetailers: string[],
    retailers: RetailerSummary[]
): { result: RecipeResult; primarySlug: string | null } {
    if (activeRetailers.length < 2) {
        // Need at least one primary + one competitor for the recipe to mean
        // anything. Return an empty result; the legend renders a hint.
        return {
            primarySlug: activeRetailers[0] ?? null,
            result: {
                recipe: 'co_occurrence',
                generated_at: new Date().toISOString(),
                scale: 'sequential',
                domain: [0, 1],
                scores: [],
            },
        };
    }

    // Pick the primary as the first active slug whose registry has the
    // highest store_count — gives the richer side of the join the spotlight.
    const ranked = activeRetailers
        .map((slug) => ({ slug, count: retailers.find((r) => r.slug === slug)?.store_count ?? 0 }))
        .sort((a, b) => b.count - a.count);
    const primary = ranked[0]?.slug ?? activeRetailers[0];
    const competitors = activeRetailers.filter((s) => s !== primary);

    const scores: RecipeAreaScore[] = [];
    let max = 0;
    for (const a of areas) {
        const p = a.store_counts_by_retailer[primary] ?? 0;
        if (p === 0) continue;
        let c = 0;
        for (const slug of competitors) c += a.store_counts_by_retailer[slug] ?? 0;
        if (c === 0) continue;
        const score = p * c;
        if (score > max) max = score;
        scores.push({
            area_key: a.area_key,
            score,
            numerator: p,
            denominator: c,
        });
    }

    return {
        primarySlug: primary,
        result: {
            recipe: 'co_occurrence',
            generated_at: new Date().toISOString(),
            scale: 'sequential',
            domain: [0, max || 1],
            scores,
        },
    };
}

export function useAtlasRecipe() {
    const { country, activeRetailers, timeWindow, overlay } = useAtlasState();
    const { loadAreas, loadRetailers, areas: areasRef, retailers: retailersRef } = useAtlasData();

    /**
     * The currently-active recipe — driven by the rail's overlay picker.
     * `'none'` keeps the existing store-count choropleth; any other value
     * triggers `load()` to populate `data`.
     */
    const recipe = computed<RecipeKey>(() => overlay.value as RecipeKey);

    const primarySlug = ref<string | null>(null);

    async function load(): Promise<void> {
        const r = recipe.value;
        if (r === 'none') {
            _data.value = null;
            _error.value = null;
            return;
        }
        const key = cacheKey({
            recipe: r,
            country: country.value,
            retailers: activeRetailers.value,
            timeWindow: timeWindow.value,
        });
        const hit = _cache.value[key];
        if (hit && Date.now() - hit.fetched_at < 60 * 60 * 1000) {
            _data.value = hit.data;
            _cacheHit.value = true;
            _error.value = null;
            return;
        }
        _cacheHit.value = false;
        _loading.value = true;
        _error.value = null;
        try {
            const [allAreas, allRetailers] = await Promise.all([loadAreas(), loadRetailers()]);
            const countryAreas = allAreas.filter((a) => a.country === country.value);
            let result: RecipeResult;
            if (r === 'co_occurrence') {
                const { result: r3, primarySlug: ps } = computeCoOccurrence(
                    countryAreas,
                    activeRetailers.value,
                    allRetailers
                );
                primarySlug.value = ps;
                result = r3;
            } else if (r === 'event_density') {
                result = await $fetch<RecipeResult>('/api/atlas/recipe/event-density', {
                    method: 'POST',
                    body: {
                        country: country.value,
                        retailers: activeRetailers.value,
                        time_window: timeWindow.value,
                    },
                });
            } else if (r === 'opens_minus_closes') {
                result = await $fetch<RecipeResult>('/api/atlas/recipe/opens-closes', {
                    method: 'POST',
                    body: {
                        country: country.value,
                        retailers: activeRetailers.value,
                        time_window: timeWindow.value,
                    },
                });
            } else {
                _data.value = null;
                return;
            }
            _data.value = result;
            _cache.value = {
                ..._cache.value,
                [key]: { data: result, fetched_at: Date.now() },
            };
            // Record server-side cache hit / latency for the footer strip.
            // R7.3 (co_occurrence) is pure client compute — no server hit to
            // record, so we skip it.
            if (r === 'event_density' || r === 'opens_minus_closes') {
                const totalMs = result.tool_calls?.reduce((sum, t) => sum + (t.ms ?? 0), 0) ?? 0;
                useAtlasTelemetry().record({
                    endpoint:
                        r === 'event_density' ? 'recipe:event-density' : 'recipe:opens-closes',
                    cache_hit: result.cache_hit ?? false,
                    elapsed_ms: totalMs,
                    ts: Date.now(),
                });
            }
        } catch (err) {
            _error.value = (err as Error).message;
        } finally {
            _loading.value = false;
        }
    }

    /**
     * Auto-recompute when any input changes. The rail mounts before the
     * canvas, so by the time the canvas reads `data` the first run is
     * already in flight.
     */
    watch(
        () => [recipe.value, country.value, activeRetailers.value, timeWindow.value],
        () => {
            // Fire-and-forget; consumers wait on `loading`.
            load();
        },
        { immediate: true }
    );

    /**
     * Score lookup keyed by `area_key`. Map gives the canvas O(1) reads
     * over its 3,600-area iteration without rebuilding per render.
     */
    const scoresByKey = computed<Map<string, RecipeAreaScore>>(() => {
        const m = new Map<string, RecipeAreaScore>();
        for (const s of _data.value?.scores ?? []) m.set(s.area_key, s);
        return m;
    });

    return {
        recipe,
        data: _data,
        loading: _loading,
        error: _error,
        cacheHit: _cacheHit,
        scoresByKey,
        primarySlug,
        load,
        // Re-export the underlying areas ref so consumers (e.g. the ranking
        // table) can read area_name / region without re-fetching.
        areas: areasRef,
        retailers: retailersRef,
    };
}
