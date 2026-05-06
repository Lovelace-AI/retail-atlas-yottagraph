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
    import { geoAlbersUsa, geoMercator, geoPath, type GeoPath, type GeoProjection } from 'd3-geo';
    import { feature, mesh } from 'topojson-client';
    import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
    import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';

    import { useAtlasData } from '~/composables/useAtlasData';
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

    const topology = shallowRef<any>(null);
    const areas = shallowRef<AreaRecord[]>([]);
    const storesByRetailer = shallowRef<Record<string, StoreRecord[]>>({});

    const ready = computed(
        () => !loading.value && !error.value && !!topology.value && retailersRef.value
    );

    function projectionFor(c: typeof country.value, w: number, h: number): GeoProjection {
        if (c === 'US') return geoAlbersUsa().fitSize([w, h], { type: 'Sphere' } as never);
        return geoMercator();
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    interface CountryData {
        polygons: FeatureCollection;
        outline: Feature | null;
    }

    function decodeCountry(): CountryData | null {
        if (!topology.value) return null;
        const objKey = topologyObjectKey(country.value);
        const obj = topology.value.objects[objKey];
        if (!obj) return null;
        const polygons = feature(topology.value, obj as any) as unknown as FeatureCollection;
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

    function choroplethFill(score: number): string {
        if (score <= 0) return 'rgba(40, 40, 40, 0.55)';
        const max = maxScore.value || 1;
        // sqrt scale to compress long-tail
        const t = Math.sqrt(score / max);
        const lightness = 30 + t * 35;
        const alpha = 0.35 + t * 0.5;
        return `hsla(150, 70%, ${lightness}%, ${alpha})`;
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
            out.push({
                area_key: pinKey,
                id: code,
                path: d,
                fill: isPinned
                    ? 'rgba(255, 215, 0, 0.55)'
                    : isHovered
                      ? choroplethFill(score * 1.15)
                      : choroplethFill(score),
                stroke: isPinned
                    ? '#ffd700'
                    : isHovered
                      ? 'rgba(255,255,255,0.6)'
                      : 'rgba(255,255,255,0.12)',
                strokeWidth: isPinned ? 1.8 : isHovered ? 1 : 0.4,
                pinned: isPinned,
                hovered: isHovered,
                haloed: isHaloed,
                title: `${name}${region ? ', ' + region : ''} · ${score.toLocaleString()} stores${neid ? ' · NEID resolved' : ''}`,
            });
        }
        return out;
    });

    const haloFeatures = computed<RenderableHalo[]>(() => {
        const out: RenderableHalo[] = [];
        for (const f of areaFeatures.value) {
            if (!f.haloed || f.pinned) continue;
            out.push({ id: f.id, path: f.path });
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
