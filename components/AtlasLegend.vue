<template>
    <div class="atlas-legend" :class="{ collapsed }">
        <div class="legend-header" @click="collapsed = !collapsed">
            <v-icon
                :icon="collapsed ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                size="small"
                class="mr-1"
            />
            <span class="legend-title">Legend</span>
        </div>
        <div v-if="!collapsed" class="legend-body">
            <div class="legend-section">
                <div class="legend-section-title">{{ rampTitle }}</div>
                <div class="ramp-row">
                    <div class="ramp">
                        <span
                            v-for="(c, i) in rampCells"
                            :key="i"
                            class="ramp-cell"
                            :style="{ background: c }"
                        />
                    </div>
                    <span class="muted mono">{{ rampLabel }}</span>
                </div>
                <div v-if="recipeData?.scale === 'diverging'" class="ramp-anchors mono muted">
                    <span>{{ Math.round(recipeData.domain[0]) }}</span>
                    <span>0</span>
                    <span>+{{ Math.round(recipeData.domain[1]) }}</span>
                </div>
                <div v-else-if="recipeData" class="ramp-anchors mono muted">
                    <span>0</span>
                    <span>{{ Math.round(recipeData.domain[1]) }}</span>
                </div>
                <div v-if="recipeData?.truncated" class="muted mono notice">
                    top-K subset (rural areas omitted)
                </div>
            </div>

            <div class="legend-section">
                <div class="legend-section-title">Active retailers</div>
                <div class="retailer-rows">
                    <div v-for="(r, i) in activeRetailerMeta" :key="r.slug" class="retailer-row">
                        <component
                            :is="i === 0 || recipe !== 'none' ? 'span' : 'span'"
                            class="retailer-swatch"
                            :class="{
                                'is-lead': i === 0 && recipe === 'none',
                                'is-pattern': i > 0 && recipe === 'none',
                            }"
                            :style="{
                                '--retailer-color': r.color,
                                background: i === 0 || recipe !== 'none' ? r.color : 'transparent',
                            }"
                            :data-pattern="
                                i > 0 && recipe === 'none' ? overlayPatternKind(i - 1) : undefined
                            "
                        />
                        <span>{{ r.name }}</span>
                        <span
                            v-if="i === 0 && activeRetailerMeta.length > 1 && recipe === 'none'"
                            class="muted mono lead-tag"
                            >lead</span
                        >
                        <span class="muted mono">{{ formatCount(r.store_count) }}</span>
                    </div>
                    <div v-if="!activeRetailerMeta.length" class="muted">
                        No retailers active. Toggle one in the rail above.
                    </div>
                </div>
            </div>

            <div class="legend-section">
                <div class="legend-section-title">Markers</div>
                <div class="marker-row">
                    <span class="dot" style="background: rgba(255, 215, 0, 0.9)" />
                    <span>Pinned</span>
                </div>
                <div class="marker-row">
                    <span class="dot ring" />
                    <span>NEID resolved (Phase 1.5)</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed, ref } from 'vue';

    import { useAtlasData } from '~/composables/useAtlasData';
    import { useAtlasRecipe } from '~/composables/useAtlasRecipe';
    import { useAtlasState } from '~/composables/useAtlasState';
    import type { RetailerSummary } from '~/types/retail';

    const { activeRetailers, country } = useAtlasState();
    const { retailers } = useAtlasData();
    const { recipe, data: recipeData } = useAtlasRecipe();

    const collapsed = ref(false);

    const activeRetailerMeta = computed<RetailerSummary[]>(() => {
        const list = (retailers.value as RetailerSummary[] | null) ?? [];
        return list.filter(
            (r) => activeRetailers.value.includes(r.slug) && r.country === country.value
        );
    });

    function formatCount(n: number): string {
        if (n < 1_000) return String(n);
        if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
        return `${Math.round(n / 1_000)}k`;
    }

    /** Pattern kinds map 1:1 to overlay-layer indices in AtlasMapCanvas. */
    function overlayPatternKind(index: number): string {
        return ['hatch-45', 'hatch-135', 'dots', 'vertical'][index % 4];
    }

    const rampTitle = computed(() => {
        switch (recipe.value) {
            case 'event_density':
                return 'Event density (R7.1)';
            case 'opens_minus_closes':
                return 'Opens − closes (R7.2)';
            case 'co_occurrence':
                return 'Co-occurrence (R7.3)';
            default:
                return 'Choropleth';
        }
    });

    const rampLabel = computed(() => {
        switch (recipe.value) {
            case 'event_density':
                return 'events / store';
            case 'opens_minus_closes':
                return 'net opens';
            case 'co_occurrence':
                return 'primary × competitor';
            default:
                return 'store density';
        }
    });

    /**
     * Build the colored ramp swatches that match the active recipe.
     * Sequential = single hue gradient; diverging = red ↔ grey ↔ green.
     */
    const rampCells = computed<string[]>(() => {
        if (recipeData.value?.scale === 'diverging') {
            return [
                'hsla(0, 75%, 38%, 0.85)',
                'hsla(0, 75%, 46%, 0.65)',
                'hsla(0, 60%, 50%, 0.45)',
                'rgba(60, 60, 60, 0.55)',
                'hsla(150, 60%, 44%, 0.45)',
                'hsla(150, 70%, 36%, 0.65)',
                'hsla(150, 70%, 32%, 0.85)',
            ];
        }
        return Array.from(
            { length: 6 },
            (_, i) => `hsla(150, 70%, ${30 + i * 6}%, ${0.4 + i * 0.1})`
        );
    });
</script>

<style scoped>
    .atlas-legend {
        position: absolute;
        left: 16px;
        bottom: 16px;
        background: rgba(20, 20, 20, 0.85);
        backdrop-filter: blur(6px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        padding: 10px 12px;
        font-size: 0.8rem;
        max-width: 260px;
        z-index: 5;
    }

    .legend-header {
        display: flex;
        align-items: center;
        cursor: pointer;
        user-select: none;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(255, 255, 255, 0.7);
    }

    .legend-section {
        margin-top: 10px;
    }

    .legend-section-title {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.65rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(255, 255, 255, 0.45);
        margin-bottom: 4px;
    }

    .ramp {
        display: inline-flex;
        height: 10px;
        border-radius: 2px;
        overflow: hidden;
    }

    .ramp-cell {
        width: 16px;
        height: 100%;
    }

    .retailer-swatch {
        display: inline-block;
        width: 14px;
        height: 14px;
        border-radius: 2px;
        border: 1px solid rgba(255, 255, 255, 0.2);
    }

    /* Mini-pattern previews for the multi-retailer overlay legend rows.
       Each pattern mirrors the SVG <pattern> kind drawn on the canvas. */
    .retailer-swatch.is-pattern {
        border-color: var(--retailer-color);
    }

    .retailer-swatch.is-pattern[data-pattern='hatch-45'] {
        background-image: linear-gradient(
            45deg,
            transparent 38%,
            var(--retailer-color) 38%,
            var(--retailer-color) 62%,
            transparent 62%
        );
        background-size: 6px 6px;
    }

    .retailer-swatch.is-pattern[data-pattern='hatch-135'] {
        background-image: linear-gradient(
            135deg,
            transparent 38%,
            var(--retailer-color) 38%,
            var(--retailer-color) 62%,
            transparent 62%
        );
        background-size: 6px 6px;
    }

    .retailer-swatch.is-pattern[data-pattern='dots'] {
        background-image: radial-gradient(var(--retailer-color) 1px, transparent 1.5px);
        background-size: 4px 4px;
    }

    .retailer-swatch.is-pattern[data-pattern='vertical'] {
        background-image: linear-gradient(
            90deg,
            transparent 38%,
            var(--retailer-color) 38%,
            var(--retailer-color) 62%,
            transparent 62%
        );
        background-size: 6px 6px;
    }

    .lead-tag {
        font-size: 0.6rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        background: rgba(255, 215, 0, 0.12);
        color: #f5d000;
        padding: 1px 4px;
        border-radius: 2px;
    }

    .ramp-row {
        display: flex;
        gap: 6px;
        align-items: center;
    }

    .ramp-anchors {
        display: flex;
        justify-content: space-between;
        font-size: 0.65rem;
        margin-top: 2px;
        max-width: 110px;
    }

    .notice {
        font-size: 0.65rem;
        margin-top: 4px;
    }

    .retailer-rows,
    .marker-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .retailer-row,
    .marker-row {
        display: flex;
        align-items: center;
        gap: 6px;
    }

    .dot {
        display: inline-block;
        width: 9px;
        height: 9px;
        border-radius: 50%;
    }

    .dot.ring {
        background: transparent;
        border: 2px solid rgba(255, 215, 0, 0.7);
    }

    .muted {
        color: rgba(255, 255, 255, 0.45);
    }

    .mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
