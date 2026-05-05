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
                <div class="legend-section-title">Choropleth</div>
                <div class="ramp-row">
                    <div class="ramp">
                        <span
                            v-for="i in 6"
                            :key="i"
                            class="ramp-cell"
                            :style="{
                                background: `hsla(150, 70%, ${30 + (i - 1) * 6}%, ${0.4 + (i - 1) * 0.1})`,
                            }"
                        />
                    </div>
                    <span class="muted mono">store density</span>
                </div>
            </div>

            <div class="legend-section">
                <div class="legend-section-title">Active retailers</div>
                <div class="retailer-rows">
                    <div v-for="r in activeRetailerMeta" :key="r.slug" class="retailer-row">
                        <span class="dot" :style="{ background: r.color }" />
                        <span>{{ r.name }}</span>
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
    import { useAtlasState } from '~/composables/useAtlasState';
    import type { RetailerSummary } from '~/types/retail';

    const { activeRetailers, country } = useAtlasState();
    const { retailers } = useAtlasData();

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

    .ramp-row {
        display: flex;
        gap: 6px;
        align-items: center;
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
