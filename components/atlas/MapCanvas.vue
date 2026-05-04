<template>
    <div ref="canvasEl" class="map-canvas">
        <svg :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="xMidYMid meet">
            <!-- Country silhouette / framing rect -->
            <rect x="0" y="0" :width="width" :height="height" fill="var(--atlas-canvas-bg)" />

            <!-- Graticule -->
            <path
                v-if="graticulePath"
                :d="graticulePath"
                fill="none"
                stroke="var(--atlas-graticule)"
                stroke-width="0.5"
            />

            <!-- Country bounding silhouette -->
            <path
                v-if="silhouettePath"
                :d="silhouettePath"
                fill="rgba(63, 234, 0, 0.025)"
                stroke="rgba(63, 234, 0, 0.15)"
                stroke-width="1"
            />

            <!-- Area choropleth fills (lead retailer) -->
            <g class="layer-area-choropleth">
                <circle
                    v-for="a in projectedAreas"
                    :key="`fill-${a.area_code}`"
                    :cx="a.x"
                    :cy="a.y"
                    :r="leadRadius(a)"
                    :fill="leadFill(a)"
                    :opacity="leadOpacity(a)"
                />
            </g>

            <!-- Pattern overlays for additional retailers -->
            <g class="layer-area-pattern">
                <circle
                    v-for="a in projectedAreas"
                    :key="`pattern-${a.area_code}`"
                    :cx="a.x"
                    :cy="a.y"
                    :r="leadRadius(a) + 4"
                    fill="none"
                    :stroke="patternStroke(a)"
                    :stroke-dasharray="patternDash(a)"
                    stroke-width="1"
                    :opacity="patternOpacity(a)"
                />
            </g>

            <!-- NEID halo -->
            <g class="layer-halo">
                <circle
                    v-for="a in haloAreas"
                    :key="`halo-${a.area_code}`"
                    :cx="a.x"
                    :cy="a.y"
                    :r="leadRadius(a) + 8"
                    fill="none"
                    stroke="var(--atlas-halo)"
                    stroke-width="1.5"
                    opacity="0.75"
                    style="filter: drop-shadow(0 0 4px rgba(255, 196, 0, 0.4))"
                />
            </g>

            <!-- Area click targets (transparent, on top of fills) -->
            <g class="layer-area-hits">
                <circle
                    v-for="a in projectedAreas"
                    :key="`hit-${a.area_code}`"
                    :cx="a.x"
                    :cy="a.y"
                    :r="Math.max(14, leadRadius(a) + 8)"
                    fill="transparent"
                    style="cursor: pointer"
                    role="button"
                    :aria-label="`${a.area_name} — ${activeRetailerCount(a)} retailers`"
                    @mouseenter="hoverArea = a"
                    @mouseleave="hoverArea = null"
                    @click="onAreaClick(a)"
                />
            </g>

            <!-- Store dots (top of stack except halo) -->
            <g class="layer-stores">
                <circle
                    v-for="s in projectedStores"
                    :key="s.store_id"
                    :cx="s.x"
                    :cy="s.y"
                    :r="storeRadius(s)"
                    :fill="retailerColor(s.retailer)"
                    :stroke="s.neid ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.15)'"
                    :stroke-width="s.neid ? 1 : 0.5"
                    :opacity="0.85"
                    :style="{ cursor: s.neid ? 'pointer' : 'default' }"
                    @mouseenter="hoverStore = s"
                    @mouseleave="hoverStore = null"
                    @click="onStoreClick(s)"
                />
            </g>

            <!-- Pinned outline -->
            <g v-if="pinnedAreaProjected" class="layer-pinned">
                <circle
                    :cx="pinnedAreaProjected.x"
                    :cy="pinnedAreaProjected.y"
                    :r="leadRadius(pinnedAreaProjected) + 14"
                    fill="none"
                    stroke="var(--lv-green)"
                    stroke-width="2"
                    stroke-dasharray="4 3"
                />
            </g>
            <g v-if="pinnedStoreProjected" class="layer-pinned">
                <circle
                    :cx="pinnedStoreProjected.x"
                    :cy="pinnedStoreProjected.y"
                    :r="storeRadius(pinnedStoreProjected) + 6"
                    fill="none"
                    stroke="var(--lv-green)"
                    stroke-width="2"
                />
            </g>
        </svg>

        <!-- Hover tooltip -->
        <div
            v-if="hoverArea && !hoverStore"
            class="hover-tooltip"
            :style="{ left: hoverArea.x + 'px', top: hoverArea.y + 'px' }"
        >
            <div class="tooltip-title">{{ hoverArea.area_name }}</div>
            <div class="tooltip-sub">{{ hoverArea.region }} · {{ hoverArea.area_type }}</div>
            <div class="tooltip-counts">
                <span v-for="r in activeRetailers" :key="r.slug" :style="{ color: r.color }">
                    {{ r.name }}:
                    {{ hoverArea.store_counts?.[r.slug] ?? 0 }}
                </span>
            </div>
            <div v-if="hoverArea.neid" class="tooltip-meta">NEID {{ hoverArea.neid }}</div>
            <div v-else class="tooltip-meta">No NEID — context unavailable</div>
        </div>

        <div
            v-if="hoverStore"
            class="hover-tooltip"
            :style="{ left: hoverStore.x + 'px', top: hoverStore.y + 'px' }"
        >
            <div class="tooltip-title">
                {{ hoverStore.retailer_name }} #{{ hoverStore.store_number }}
            </div>
            <div class="tooltip-sub">
                {{ hoverStore.format }}{{ hoverStore.banner ? ' · ' + hoverStore.banner : '' }}
            </div>
            <div class="tooltip-counts">{{ hoverStore.address }}, {{ hoverStore.city }}</div>
            <div class="tooltip-meta">
                {{ hoverStore.neid ? 'Click for context' : 'Context unavailable for this store' }}
            </div>
        </div>

        <!-- Pinned badge -->
        <div v-if="pinnedBadge" class="pinned-badge">
            <span class="pinned-label">Pinned</span>
            <span>{{ pinnedBadge }}</span>
            <button class="pinned-clear" @click="clearPin" aria-label="Clear pin">×</button>
        </div>

        <!-- Legend -->
        <MapLegend :retailers="retailers" />
    </div>
</template>

<script setup lang="ts">
    import { geoAlbersUsa, geoMercator, geoEquirectangular, geoPath, geoGraticule10 } from 'd3-geo';

    import type { Area, Retailer, Store } from '~/composables/useAtlasData';

    const props = defineProps<{
        retailers: Retailer[];
        areas: Area[];
        stores: Store[];
    }>();

    const { state, pinArea, pinStore, clearPin } = useAtlasState();

    const canvasEl = ref<HTMLDivElement | null>(null);
    const width = ref(960);
    const height = ref(540);

    const hoverArea = ref<(Area & { x: number; y: number }) | null>(null);
    const hoverStore = ref<(Store & { x: number; y: number }) | null>(null);

    let resizeObserver: ResizeObserver | null = null;

    onMounted(() => {
        if (!canvasEl.value) return;
        const update = () => {
            const rect = canvasEl.value!.getBoundingClientRect();
            if (rect.width > 0) width.value = rect.width;
            if (rect.height > 0) height.value = rect.height;
        };
        update();
        resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(canvasEl.value);
    });

    onUnmounted(() => {
        resizeObserver?.disconnect();
    });

    const projection = computed(() => {
        const w = width.value;
        const h = height.value;
        if (state.country === 'US') {
            return geoAlbersUsa()
                .scale(w * 1.1)
                .translate([w / 2, h / 2]);
        }
        if (state.country === 'UK') {
            return geoMercator()
                .center([-3.5, 54.5])
                .scale(w * 2.2)
                .translate([w / 2, h / 2]);
        }
        // CA
        return geoMercator()
            .center([-95, 60])
            .scale(w * 0.45)
            .translate([w / 2, h / 2]);
    });

    const graticulePath = computed(() => {
        const path = geoPath(projection.value as any);
        try {
            return path(geoGraticule10()) ?? '';
        } catch {
            return '';
        }
    });

    const silhouettePath = computed(() => {
        // Simple bounding-box silhouette per country — the PRD describes a
        // proper TopoJSON pipeline that lives in `@lovelace/retail-data`,
        // not yet available at runtime.
        const w = width.value;
        const h = height.value;
        const inset = 24;
        return `M ${inset} ${inset} H ${w - inset} V ${h - inset} H ${inset} Z`;
    });

    interface ProjectedArea extends Area {
        x: number;
        y: number;
    }
    interface ProjectedStore extends Store {
        x: number;
        y: number;
    }

    const projectedAreas = computed<ProjectedArea[]>(() => {
        const proj = projection.value as any;
        return props.areas
            .filter((a) => a.country === state.country)
            .map((a) => {
                const pt = proj([a.centroid[0], a.centroid[1]]);
                return pt ? { ...a, x: pt[0], y: pt[1] } : null;
            })
            .filter((a): a is ProjectedArea => a !== null);
    });

    const projectedStores = computed<ProjectedStore[]>(() => {
        const proj = projection.value as any;
        return props.stores
            .filter((s) => s.country === state.country && state.retailers.has(s.retailer))
            .map((s) => {
                const pt = proj([s.lng, s.lat]);
                return pt ? { ...s, x: pt[0], y: pt[1] } : null;
            })
            .filter((s): s is ProjectedStore => s !== null);
    });

    const haloAreas = computed(() =>
        projectedAreas.value.filter((a) => a.neid && activeRetailerCount(a as any) > 0)
    );

    const activeRetailers = computed(() =>
        props.retailers.filter((r) => state.retailers.has(r.slug))
    );

    const leadRetailerSlug = computed(() => {
        // The "first activated retailer" — fall back to first available.
        return Array.from(state.retailers)[0] ?? props.retailers[0]?.slug ?? '';
    });

    function activeRetailerCount(a: Area) {
        return activeRetailers.value.reduce((sum, r) => sum + (a.store_counts?.[r.slug] ?? 0), 0);
    }

    function leadRadius(a: Area) {
        const lead = leadRetailerSlug.value;
        const count = a.store_counts?.[lead] ?? activeRetailerCount(a);
        if (!count) return 5;
        return 5 + Math.sqrt(count) * 2.4;
    }

    function leadFill(a: Area) {
        const lead = props.retailers.find((r) => r.slug === leadRetailerSlug.value);
        return lead?.color ?? 'rgba(255, 255, 255, 0.2)';
    }

    function leadOpacity(a: Area) {
        const lead = leadRetailerSlug.value;
        const count = a.store_counts?.[lead] ?? 0;
        if (!count) return 0.05;
        return Math.min(0.55, 0.18 + count / 120);
    }

    function patternStroke(a: Area) {
        // Use the second active retailer for the pattern overlay
        const slugs = Array.from(state.retailers).filter((s) => s !== leadRetailerSlug.value);
        const slug = slugs[0];
        if (!slug) return 'transparent';
        return props.retailers.find((r) => r.slug === slug)?.color ?? 'transparent';
    }

    function patternDash(_a: Area) {
        return '3 3';
    }

    function patternOpacity(a: Area) {
        const slugs = Array.from(state.retailers).filter((s) => s !== leadRetailerSlug.value);
        const slug = slugs[0];
        if (!slug) return 0;
        const count = a.store_counts?.[slug] ?? 0;
        return Math.min(0.7, count / 60);
    }

    function retailerColor(slug: string) {
        return props.retailers.find((r) => r.slug === slug)?.color ?? 'white';
    }

    function storeRadius(s: Store) {
        // Format-based sizing (R3.1 #5)
        const f = (s.format || '').toLowerCase();
        if (f.includes('super')) return 4.5;
        if (f.includes('extra')) return 4;
        if (f.includes('express') || f.includes('small') || f.includes('metro')) return 2.5;
        return 3.2;
    }

    function onAreaClick(a: ProjectedArea) {
        if (!a.neid) return;
        pinArea(a.area_code);
    }

    function onStoreClick(s: ProjectedStore) {
        if (!s.neid) return;
        pinStore(s.store_id);
    }

    const pinnedAreaProjected = computed<ProjectedArea | null>(
        () => projectedAreas.value.find((a) => a.area_code === state.pinnedAreaCode) ?? null
    );

    const pinnedStoreProjected = computed<ProjectedStore | null>(
        () => projectedStores.value.find((s) => s.store_id === state.pinnedStoreId) ?? null
    );

    const pinnedBadge = computed(() => {
        if (pinnedAreaProjected.value)
            return `${pinnedAreaProjected.value.area_name} · ${pinnedAreaProjected.value.area_type.toUpperCase()}`;
        if (pinnedStoreProjected.value)
            return `${pinnedStoreProjected.value.retailer_name} #${pinnedStoreProjected.value.store_number}`;
        return null;
    });

    function onKey(e: KeyboardEvent) {
        if (e.key === 'Escape') clearPin();
    }

    onMounted(() => window.addEventListener('keydown', onKey));
    onUnmounted(() => window.removeEventListener('keydown', onKey));
</script>

<style scoped>
    .map-canvas {
        position: relative;
        width: 100%;
        height: 100%;
        background: var(--atlas-canvas-bg);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        overflow: hidden;
    }

    svg {
        width: 100%;
        height: 100%;
        display: block;
    }

    .hover-tooltip {
        position: absolute;
        pointer-events: none;
        background: rgba(20, 20, 20, 0.96);
        backdrop-filter: blur(6px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 0.78rem;
        color: var(--lv-white);
        transform: translate(12px, -50%);
        max-width: 240px;
        z-index: 5;
    }

    .tooltip-title {
        font-weight: 500;
        margin-bottom: 2px;
    }

    .tooltip-sub {
        color: var(--lv-silver);
        font-size: 0.72rem;
        margin-bottom: 4px;
    }

    .tooltip-counts {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        font-size: 0.72rem;
        margin-bottom: 4px;
    }

    .tooltip-meta {
        font-family: var(--font-mono);
        font-size: 0.68rem;
        color: var(--lv-silver);
    }

    .pinned-badge {
        position: absolute;
        top: 12px;
        right: 12px;
        background: rgba(63, 234, 0, 0.12);
        border: 1px solid var(--lv-green);
        color: var(--lv-green-light);
        padding: 4px 10px;
        border-radius: 999px;
        font-family: var(--font-mono);
        font-size: 0.75rem;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .pinned-label {
        text-transform: uppercase;
        font-size: 0.65rem;
        letter-spacing: 0.08em;
        opacity: 0.6;
    }

    .pinned-clear {
        background: transparent;
        border: none;
        color: var(--lv-green-light);
        font-size: 1.1rem;
        line-height: 1;
        cursor: pointer;
        padding: 0 2px;
    }

    .pinned-clear:hover {
        color: var(--lv-white);
    }
</style>
