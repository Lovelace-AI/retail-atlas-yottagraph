<template>
    <div ref="containerRef" class="map-canvas-container">
        <svg
            v-if="ready"
            :width="size.w"
            :height="size.h"
            class="map-canvas-svg"
            role="img"
            :aria-label="`Retail Atlas map of ${country}`"
            @click="handleBackgroundClick"
        >
            <!-- Layer 1: country basemap silhouette -->
            <g class="layer-basemap">
                <path v-for="(d, i) in basemapPaths" :key="`bm-${i}`" :d="d" class="basemap-path" />
            </g>

            <!-- Layer 2 + 3: admin polygons + choropleth fill -->
            <g class="layer-areas">
                <path
                    v-for="feat in areaFeatures"
                    :key="feat.id"
                    :d="feat.path"
                    :fill="feat.fill"
                    :stroke="feat.stroke"
                    :stroke-width="feat.strokeWidth"
                    class="area-path"
                    :class="{ 'area-pinned': feat.pinned, 'area-hovered': feat.hovered }"
                    role="button"
                    tabindex="0"
                    @mouseenter="hoveredAreaKey = feat.area_key"
                    @mouseleave="hoveredAreaKey = null"
                    @click.stop="pinArea(feat.area_key)"
                    @keydown.enter.stop="pinArea(feat.area_key)"
                >
                    <title>
                        {{ feat.title }}
                    </title>
                </path>
            </g>

            <!-- Layer 4: NEID halo (PRD R3.1) — gold outline on areas with a
                 resolved Elemental NEID and >=1 active-retailer store. Hidden
                 when the rail's "NEID halo" switch is off. -->
            <g v-if="showHalo" class="layer-halo" pointer-events="none">
                <path
                    v-for="feat in haloFeatures"
                    :key="`halo-${feat.id}`"
                    :d="feat.path"
                    class="halo-path"
                />
            </g>

            <!-- Layer 5: store dots (one set per active retailer) -->
            <g
                v-for="dotLayer in dotLayers"
                :key="`dots-${dotLayer.slug}`"
                :class="`dots-${dotLayer.slug}`"
            >
                <circle
                    v-for="(d, i) in dotLayer.dots"
                    :key="`${dotLayer.slug}-${i}`"
                    :cx="d.x"
                    :cy="d.y"
                    :r="d.r"
                    :fill="dotLayer.color"
                    :fill-opacity="dotLayer.opacity"
                    :stroke="d.pinned ? '#ffd700' : 'rgba(0,0,0,0.4)'"
                    :stroke-width="d.pinned ? 2 : 0.5"
                    class="store-dot"
                    @click.stop="pinStore(d.store_id, dotLayer.slug)"
                >
                    <title>{{ d.title }}</title>
                </circle>
            </g>
        </svg>

        <!-- Status overlay: empty / loading / error -->
        <div v-if="!ready" class="status-overlay">
            <v-progress-circular v-if="loading" indeterminate color="primary" />
            <div v-if="error" class="error-msg">
                <v-icon icon="mdi-alert" color="error" class="mr-2" />
                {{ error }}
            </div>
            <div v-if="!loading && !error" class="muted">Initializing map…</div>
        </div>

        <div v-if="dotsCapped" class="dots-cap-notice">
            Showing {{ DOT_CAP_PER_RETAILER.toLocaleString() }} dots per retailer (sampled).
            Per-store density rendering is a Phase 1.5 task.
        </div>
    </div>
</template>

<script setup lang="ts">
    import {
        geoAlbersUsa,
        geoIdentity,
        geoMercator,
        geoPath,
        type GeoPath,
        type GeoProjection,
    } from 'd3-geo';
    import { feature, mesh } from 'topojson-client';
    import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
    import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';

    import { useAtlasData } from '~/composables/useAtlasData';
    import { useAtlasRecipe } from '~/composables/useAtlasRecipe';
    import { useAtlasState } from '~/composables/useAtlasState';
    import type { AreaRecord, RetailerSummary, StoreRecord } from '~/types/retail';

    const DOT_CAP_PER_RETAILER = 5000;

    const containerRef = ref<HTMLDivElement | null>(null);
    const size = ref({ w: 800, h: 600 });

    const loading = ref(true);
    const error = ref<string | null>(null);

    const {
        country,
        activeRetailers,
        pinned,
        hoveredAreaKey,
        showHalo,
        pinArea,
        pinStore,
        clearPin,
    } = useAtlasState();
    const {
        loadRetailers,
        loadAreas,
        loadStores,
        loadTopology,
        topologyObjectKey,
        retailers: retailersRef,
    } = useAtlasData();
    // R7 — pull the active recipe's per-area score map, if any.
    const { recipe, data: recipeData, scoresByKey: recipeScores } = useAtlasRecipe();

    const topology = shallowRef<any>(null);
    const areas = shallowRef<AreaRecord[]>([]);
    const storesByRetailer = shallowRef<Record<string, StoreRecord[]>>({});

    const ready = computed(
        () => !loading.value && !error.value && !!topology.value && retailersRef.value
    );

    function projectionFor(c: typeof country.value, w: number, h: number): GeoProjection {
        if (c === 'US') return geoAlbersUsa().fitSize([w, h], { type: 'Sphere' } as never);
        // Canada uses a planar `geoIdentity` projection because the
        // Statistics Canada CMA TopoJSON we ship in `public/data/topojson/ca/`
        // contains MultiPolygons with hundreds of pixel-scale "islands"
        // that decode with mixed/inverted ring winding. Spherical Mercator
        // (rightly) interprets a counter-clockwise outer ring as "the
        // rest of the sphere", and even a single such sub-polygon makes
        // d3-geo project the whole feature as the full Mercator clip
        // rectangle — every `.area-path` ends up filling the canvas, so
        // the map looks like a solid black box instead of a set of CMA
        // polygons. Planar projection bypasses spherical winding entirely
        // and still produces a recognizable Canada at this latitude band.
        // UK keeps Mercator (the ONS LAD topology is well-formed).
        if (c === 'CA') return geoIdentity().reflectY(true);
        return geoMercator();
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    interface CountryData {
        polygons: FeatureCollection;
        outline: Feature | null;
    }

    /**
     * Drop degenerate rings from a Polygon / MultiPolygon. Some upstream
     * boundary files (notably the Statistics Canada CMA TopoJSON we fetch
     * for `CA`) contain MultiPolygons with hundreds of zero-area "islands"
     * that are just a single point repeated. d3-geo's spherical Mercator
     * treats those as ambiguous-winding polygons and projects them as the
     * entire visible hemisphere — every `.area-path` ends up filling the
     * whole canvas, so the map renders as a solid block instead of a set
     * of admin polygons. Filtering rings to {min 4 unique points, non-zero
     * planar area} restores normal rendering without re-running the build.
     */
    function ringIsDegenerate(ring: number[][]): boolean {
        if (!ring || ring.length < 4) return true;
        const seen = new Set<string>();
        for (const [x, y] of ring) seen.add(`${x},${y}`);
        if (seen.size < 3) return true;
        let area = 0;
        for (let i = 0, n = ring.length - 1; i < n; i++) {
            const [x1, y1] = ring[i];
            const [x2, y2] = ring[i + 1];
            area += x1 * y2 - x2 * y1;
        }
        return Math.abs(area) < 1e-12;
    }

    function cleanFeature(f: Feature): Feature | null {
        const g = f.geometry as any;
        if (!g) return null;
        if (g.type === 'Polygon') {
            const rings = (g.coordinates as number[][][]).filter(
                (r, i) => i > 0 || !ringIsDegenerate(r)
            );
            if (rings.length === 0 || ringIsDegenerate(rings[0])) return null;
            return { ...f, geometry: { type: 'Polygon', coordinates: rings } } as Feature;
        }
        if (g.type === 'MultiPolygon') {
            const polys = (g.coordinates as number[][][][])
                .filter((p) => p.length > 0 && !ringIsDegenerate(p[0]))
                .map((p) => p.filter((r, i) => i === 0 || !ringIsDegenerate(r)));
            if (polys.length === 0) return null;
            if (polys.length === 1) {
                return { ...f, geometry: { type: 'Polygon', coordinates: polys[0] } } as Feature;
            }
            return { ...f, geometry: { type: 'MultiPolygon', coordinates: polys } } as Feature;
        }
        return f;
    }

    function decodeCountry(): CountryData | null {
        if (!topology.value) return null;
        const objKey = topologyObjectKey(country.value);
        const obj = topology.value.objects[objKey];
        if (!obj) return null;
        const raw = feature(topology.value, obj as any) as unknown as FeatureCollection;
        const cleaned = raw.features
            .map((f) => cleanFeature(f as Feature))
            .filter((f): f is Feature => f !== null);
        const polygons: FeatureCollection = { type: 'FeatureCollection', features: cleaned };
        // eslint-disable-next-line no-console
        console.warn(
            `[atlas-cleanup] ${country.value} kept ${cleaned.length}/${raw.features.length} features`
        );
        // For US, derive nation outline from the states layer; for UK / CA the
        // file only contains the admin layer, so we approximate the outline
        // via the merged mesh of the admin polygons.
        let outline: Feature | null = null;
        if (country.value === 'US' && topology.value.objects.nation) {
            outline = feature(
                topology.value,
                topology.value.objects.nation as any
            ) as unknown as Feature;
        } else {
            const m = mesh(topology.value, obj as any);
            outline = m ? ({ type: 'Feature', geometry: m, properties: {} } as Feature) : null;
        }
        return { polygons, outline };
    }

    const countryData = computed(() => decodeCountry());

    const projection = computed<GeoProjection | null>(() => {
        const cd = countryData.value;
        if (!cd) return null;
        const proj = projectionFor(country.value, size.value.w, size.value.h);
        if (country.value !== 'US') {
            proj.fitSize([size.value.w, size.value.h], cd.polygons as never);
        } else {
            proj.fitSize([size.value.w, size.value.h], cd.polygons as never);
        }
        return proj;
    });

    const pathGen = computed<GeoPath | null>(() => {
        const proj = projection.value;
        if (!proj) return null;
        return geoPath(proj);
    });

    const basemapPaths = computed<string[]>(() => {
        const cd = countryData.value;
        const pg = pathGen.value;
        if (!cd || !pg || !cd.outline) return [];
        const d = pg(cd.outline as never);
        return d ? [d] : [];
    });

    const countryAreas = computed(() => {
        const list = areas.value;
        const c = country.value;
        return list.filter((a) => a.country === c);
    });

    const areasByCode = computed(() => {
        const map = new Map<string, AreaRecord>();
        for (const a of countryAreas.value) map.set(a.area_code, a);
        return map;
    });

    const maxScore = computed(() => {
        let max = 0;
        for (const a of countryAreas.value) {
            let s = 0;
            for (const slug of activeRetailers.value) {
                s += a.store_counts_by_retailer[slug] ?? 0;
            }
            if (s > max) max = s;
        }
        return max;
    });

    function sequentialFill(score: number, max: number): string {
        if (score <= 0) return 'rgba(40, 40, 40, 0.55)';
        const m = max || 1;
        // sqrt scale to compress long-tail
        const t = Math.sqrt(score / m);
        const lightness = 30 + t * 35;
        const alpha = 0.35 + t * 0.5;
        return `hsla(150, 70%, ${lightness}%, ${alpha})`;
    }

    /**
     * Diverging fill — red for negative, neutral grey at zero, green for
     * positive. Used by R7.1 (when a midpoint is set) and R7.2.
     */
    function divergingFill(score: number, domain: [number, number], midpoint = 0): string {
        const [lo, hi] = domain;
        if (!Number.isFinite(score)) return 'rgba(40, 40, 40, 0.55)';
        if (score === midpoint) return 'rgba(60, 60, 60, 0.55)';
        if (score < midpoint) {
            const range = midpoint - lo || 1;
            const t = Math.min(1, (midpoint - score) / range);
            const lightness = 38 + (1 - t) * 12;
            const alpha = 0.4 + t * 0.45;
            return `hsla(0, 75%, ${lightness}%, ${alpha})`;
        }
        const range = hi - midpoint || 1;
        const t = Math.min(1, (score - midpoint) / range);
        const lightness = 32 + (1 - t) * 12;
        const alpha = 0.4 + t * 0.45;
        return `hsla(150, 70%, ${lightness}%, ${alpha})`;
    }

    /**
     * Pick the right fill for the active recipe.
     * - `none`: existing store-count sequential ramp.
     * - recipe with `sequential` scale: shade by `score / domain[1]`.
     * - recipe with `diverging` scale: red↔grey↔green about `midpoint`.
     */
    function recipeFill(areaKey: string, fallbackScore: number): string {
        if (recipe.value === 'none' || !recipeData.value) {
            return sequentialFill(fallbackScore, maxScore.value);
        }
        const entry = recipeScores.value.get(areaKey);
        if (!entry) return 'rgba(40, 40, 40, 0.4)';
        const r = recipeData.value;
        if (r.scale === 'diverging') {
            return divergingFill(entry.score, r.domain, r.midpoint ?? 0);
        }
        return sequentialFill(entry.score, r.domain[1] || 1);
    }

    interface RenderableArea {
        area_key: string;
        id: string;
        path: string;
        fill: string;
        stroke: string;
        strokeWidth: number;
        pinned: boolean;
        hovered: boolean;
        haloed: boolean;
        title: string;
    }

    interface RenderableHalo {
        id: string;
        path: string;
    }

    const areaFeatures = computed<RenderableArea[]>(() => {
        const cd = countryData.value;
        const pg = pathGen.value;
        if (!cd || !pg) return [];
        const out: RenderableArea[] = [];
        for (const f of cd.polygons.features as Feature<Polygon | MultiPolygon>[]) {
            const code = String(f.id ?? (f.properties as any)?.code ?? '');
            if (!code) continue;
            const area = areasByCode.value.get(code);
            const score = area
                ? activeRetailers.value.reduce(
                      (s, slug) => s + (area.store_counts_by_retailer[slug] ?? 0),
                      0
                  )
                : 0;
            const d = pg(f);
            if (!d) continue;
            const pinKey = area
                ? area.area_key
                : `${country.value}:${
                      country.value === 'US' ? 'county' : country.value === 'UK' ? 'lad' : 'cma'
                  }:${code}`;
            const isPinned = pinned.value?.kind === 'area' && pinned.value.area_key === pinKey;
            const isHovered = hoveredAreaKey.value === pinKey;
            const isHaloed = !!area?.neid && score > 0;
            const name = area?.area_name ?? (f.properties as any)?.name ?? code;
            const region = area?.region ?? '';
            const neid = area?.neid;
            const recipeEntry = recipeScores.value.get(pinKey);
            const fillBase = recipeFill(pinKey, score);
            out.push({
                area_key: pinKey,
                id: code,
                path: d,
                fill: isPinned ? 'rgba(255, 215, 0, 0.55)' : fillBase,
                stroke: isPinned
                    ? '#ffd700'
                    : isHovered
                      ? 'rgba(255,255,255,0.6)'
                      : 'rgba(255,255,255,0.12)',
                strokeWidth: isPinned ? 1.8 : isHovered ? 1 : 0.4,
                pinned: isPinned,
                hovered: isHovered,
                haloed: isHaloed,
                title: tooltipFor(name, region, score, neid, recipeEntry, area),
            });
        }
        return out;
    });

    function tooltipFor(
        name: string,
        region: string,
        storeCount: number,
        neid: string | null | undefined,
        recipeEntry: { score: number; numerator?: number; denominator?: number } | undefined,
        area: AreaRecord | undefined
    ): string {
        const head = `${name}${region ? ', ' + region : ''}`;
        const haloMark = neid ? ' · NEID resolved' : '';

        // R4.1: when no recipe is active and >=1 retailer is active, the tooltip
        // breaks the polygon's store count down by retailer regardless of which
        // retailer's fill or pattern is drawing the polygon.
        if (recipe.value === 'none' && area && activeRetailers.value.length > 0) {
            const parts: string[] = [];
            for (const slug of activeRetailers.value) {
                const c = area.store_counts_by_retailer[slug] ?? 0;
                if (c > 0) {
                    const meta = (retailersRef.value ?? []).find((r) => r.slug === slug);
                    parts.push(`${meta?.name ?? slug} ${c.toLocaleString()}`);
                }
            }
            const breakdown = parts.length ? ' · ' + parts.join(' · ') : '';
            return `${head}${breakdown}${haloMark}`;
        }

        const baseStores = `${storeCount.toLocaleString()} stores`;
        if (!recipeEntry || recipe.value === 'none') {
            return `${head} · ${baseStores}${haloMark}`;
        }
        const ratio = recipeEntry.score.toFixed(2);
        if (recipe.value === 'event_density') {
            return `${head} · ${recipeEntry.numerator ?? 0} events / ${recipeEntry.denominator ?? 0} stores · density ${ratio}`;
        }
        if (recipe.value === 'opens_minus_closes') {
            const opens = recipeEntry.numerator ?? 0;
            const closes = recipeEntry.denominator ?? 0;
            return `${head} · opens ${opens} / closes ${closes} · net ${recipeEntry.score >= 0 ? '+' : ''}${recipeEntry.score}`;
        }
        if (recipe.value === 'co_occurrence') {
            return `${head} · ${recipeEntry.numerator ?? 0} primary × ${recipeEntry.denominator ?? 0} competitor · ${baseStores}`;
        }
        return `${head} · ${baseStores}${haloMark}`;
    }

    const haloFeatures = computed<RenderableHalo[]>(() => {
        const out: RenderableHalo[] = [];
        for (const f of areaFeatures.value) {
            if (!f.haloed || f.pinned) continue;
            out.push({ id: f.id, path: f.path });
        }
        return out;
    });

    /**
     * R4.1 — multi-retailer pattern overlays.
     *
     * Each non-lead active retailer gets one SVG <pattern> def + one rendering
     * layer. The pattern kind cycles through hatch-45, hatch-135, dots, vertical
     * (in that order) so the four-retailer simultaneous case stays decodable.
     * Pattern color = retailer color (parsed from the registry's `hsl(...)`
     * string); per-area opacity = sqrt(retailer_count / max_retailer_count) so
     * dense areas stand out.
     *
     * Skipped when a recipe is active (recipe drives the polygon fill alone).
     */
    interface OverlayPattern {
        id: string;
        slug: string;
        color: string;
        kind: 'hatch-45' | 'hatch-135' | 'vertical' | 'dots';
        size: number;
    }

    interface OverlayPatch {
        id: string;
        path: string;
        opacity: number;
    }

    interface OverlayLayer {
        slug: string;
        patternId: string;
        patches: OverlayPatch[];
    }

    /** Slugs to render as overlays — every active retailer except the lead. */
    const overlaySlugs = computed<string[]>(() => {
        if (recipe.value !== 'none') return [];
        const lead = leadSlug.value;
        const list = activeRetailers.value.filter(
            (slug) => slug !== lead && !!(retailersRef.value ?? []).find((r) => r.slug === slug)
        );
        return list;
    });

    const overlayPatterns = computed<OverlayPattern[]>(() => {
        const kinds: OverlayPattern['kind'][] = ['hatch-45', 'hatch-135', 'dots', 'vertical'];
        const out: OverlayPattern[] = [];
        overlaySlugs.value.forEach((slug, i) => {
            const meta = (retailersRef.value ?? []).find((r) => r.slug === slug);
            if (!meta) return;
            out.push({
                id: `atlas-pat-${slug}`,
                slug,
                color: meta.color,
                kind: kinds[i % kinds.length],
                size: 6,
            });
        });
        return out;
    });

    const overlayLayers = computed<OverlayLayer[]>(() => {
        const slugs = overlaySlugs.value;
        if (slugs.length === 0) return [];
        const out: OverlayLayer[] = [];
        const maxByRetailer = retailerMaxByCountry.value;
        for (const slug of slugs) {
            const max = maxByRetailer[slug] ?? 0;
            if (max === 0) continue;
            const patches: OverlayPatch[] = [];
            for (const f of areaFeatures.value) {
                if (f.pinned) continue;
                const area = areasByCode.value.get(f.id);
                const c = area?.store_counts_by_retailer[slug] ?? 0;
                if (c <= 0) continue;
                const t = Math.sqrt(c / max);
                // Floor at 0.18 so a one-store county still reads at all.
                const opacity = Math.max(0.18, Math.min(0.9, t));
                patches.push({ id: f.id, path: f.path, opacity });
            }
            if (patches.length === 0) continue;
            out.push({
                slug,
                patternId: `atlas-pat-${slug}`,
                patches,
            });
        }
        return out;
    });

    interface DotLayer {
        slug: string;
        color: string;
        opacity: number;
        dots: {
            x: number;
            y: number;
            r: number;
            store_id: string;
            title: string;
            pinned: boolean;
        }[];
    }

    const dotsCapped = ref(false);

    const dotLayers = computed<DotLayer[]>(() => {
        const proj = projection.value;
        if (!proj) return [];
        const out: DotLayer[] = [];
        let capHit = false;
        for (const slug of activeRetailers.value) {
            const meta = (retailersRef.value ?? []).find((r) => r.slug === slug);
            if (!meta) continue;
            const all = storesByRetailer.value[slug] ?? [];
            const filtered = all.filter((s) => s.country === country.value);
            let stores = filtered;
            if (filtered.length > DOT_CAP_PER_RETAILER) {
                capHit = true;
                stores = sampleEven(filtered, DOT_CAP_PER_RETAILER);
            }
            const dots: DotLayer['dots'] = [];
            for (const s of stores) {
                if (s.lat === null || s.lng === null) continue;
                const p = proj([s.lng, s.lat] as [number, number]);
                if (!p) continue;
                const isPinned =
                    pinned.value?.kind === 'store' && pinned.value.store_id === s.store_id;
                dots.push({
                    x: p[0],
                    y: p[1],
                    r: dotRadius(s.format),
                    store_id: s.store_id,
                    title: storeTitle(s, meta),
                    pinned: isPinned,
                });
            }
            out.push({
                slug,
                color: meta.color,
                opacity: 0.75,
                dots,
            });
        }
        dotsCapped.value = capHit;
        return out;
    });

    function dotRadius(format: string | null): number {
        if (!format) return 1.8;
        const f = format.toLowerCase();
        if (f.includes('supercenter') || f.includes('extra')) return 2.6;
        if (f.includes('express') || f.includes('metro') || f.includes('local')) return 1.4;
        return 1.8;
    }

    function storeTitle(s: StoreRecord, meta: RetailerSummary): string {
        const parts: string[] = [meta.name];
        if (s.format) parts.push(s.format);
        if (s.address) parts.push(s.address);
        if (s.city) parts.push(s.city);
        return parts.join(' · ');
    }

    function sampleEven<T>(arr: T[], n: number): T[] {
        if (arr.length <= n) return arr.slice();
        const out: T[] = [];
        const step = arr.length / n;
        for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
        return out;
    }

    function handleBackgroundClick(): void {
        clearPin();
    }

    let resizeObs: ResizeObserver | null = null;

    onMounted(async () => {
        if (containerRef.value) {
            const updateSize = () => {
                const el = containerRef.value;
                if (!el) return;
                size.value = {
                    w: el.clientWidth || 800,
                    h: el.clientHeight || 600,
                };
            };
            updateSize();
            resizeObs = new ResizeObserver(updateSize);
            resizeObs.observe(containerRef.value);
        }

        try {
            await Promise.all([loadRetailers(), loadAreas()]);
            areas.value = (await loadAreas()) ?? [];
            const topo = await loadTopology(country.value);
            topology.value = topo;
            // Preload stores for the default-active retailers
            await loadActiveStores();
        } catch (err) {
            error.value = (err as Error).message;
        } finally {
            loading.value = false;
        }
    });

    onUnmounted(() => {
        if (resizeObs) resizeObs.disconnect();
    });

    async function loadActiveStores(): Promise<void> {
        const slugs = activeRetailers.value.slice();
        const loaded = await Promise.all(slugs.map((slug) => loadStores(slug)));
        const m = { ...storesByRetailer.value };
        for (let i = 0; i < slugs.length; i++) m[slugs[i]] = loaded[i];
        storesByRetailer.value = m;
    }

    watch(country, async () => {
        loading.value = true;
        try {
            const topo = await loadTopology(country.value);
            topology.value = topo;
        } catch (err) {
            error.value = (err as Error).message;
        } finally {
            loading.value = false;
        }
    });

    watch(
        activeRetailers,
        async () => {
            await loadActiveStores();
        },
        { immediate: false }
    );
    /* eslint-enable @typescript-eslint/no-explicit-any */
</script>

<style scoped>
    .map-canvas-container {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 480px;
        background: linear-gradient(180deg, #0a0a0a, #141414);
        overflow: hidden;
    }

    .map-canvas-svg {
        display: block;
        width: 100%;
        height: 100%;
    }

    .layer-basemap .basemap-path {
        fill: rgba(20, 20, 20, 0.7);
        stroke: rgba(255, 255, 255, 0.06);
        stroke-width: 0.4;
    }

    .layer-halo .halo-path {
        fill: none;
        stroke: hsl(48, 100%, 70%);
        stroke-width: 1.4;
        stroke-opacity: 0.85;
        filter: drop-shadow(0 0 3px hsla(48, 100%, 70%, 0.6));
        transition: stroke-opacity 150ms ease-out;
    }

    .area-path {
        cursor: pointer;
        transition:
            fill 150ms ease-out,
            stroke 150ms ease-out;
    }

    .area-path:focus {
        outline: none;
        stroke: rgba(63, 234, 0, 0.85) !important;
        stroke-width: 1.5 !important;
    }

    .store-dot {
        cursor: pointer;
        transition: r 120ms ease-out;
    }

    .status-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
    }

    .error-msg {
        color: #ef4444;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.875rem;
        background: rgba(20, 20, 20, 0.8);
        padding: 8px 12px;
        border: 1px solid rgba(239, 68, 68, 0.4);
        border-radius: 6px;
        pointer-events: auto;
    }

    .muted {
        color: rgba(255, 255, 255, 0.4);
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.85rem;
    }

    .dots-cap-notice {
        position: absolute;
        top: 12px;
        right: 12px;
        background: rgba(20, 20, 20, 0.85);
        color: rgba(255, 255, 255, 0.6);
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.7rem;
        padding: 6px 10px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 4px;
        max-width: 360px;
    }
</style>
