<template>
    <div class="map-legend" :class="{ collapsed }">
        <div class="legend-header" @click="collapsed = !collapsed">
            <span>Legend</span>
            <v-icon size="small">{{ collapsed ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        </div>
        <div v-if="!collapsed" class="legend-body">
            <div class="legend-row">
                <span class="halo-swatch" />
                <span>Elemental-tracked area (clickable)</span>
            </div>
            <div class="legend-row">
                <span class="area-swatch" />
                <span>Polygon (no NEID)</span>
            </div>
            <div v-for="r in activeRetailers" :key="r.slug" class="legend-row">
                <span class="dot-swatch" :style="{ background: r.color }" />
                <span>{{ r.name }} stores</span>
            </div>
            <div class="legend-row legend-divider" />
            <div class="legend-row legend-note">Hover for tooltips · click halo to pin</div>
        </div>
    </div>
</template>

<script setup lang="ts">
    import type { Retailer } from '~/composables/useAtlasData';

    const props = defineProps<{ retailers: Retailer[] }>();
    const { state } = useAtlasState();

    const collapsed = ref(false);

    const activeRetailers = computed(() =>
        props.retailers.filter((r) => state.retailers.has(r.slug))
    );
</script>

<style scoped>
    .map-legend {
        position: absolute;
        left: 12px;
        bottom: 12px;
        background: rgba(20, 20, 20, 0.92);
        backdrop-filter: blur(6px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        padding: 8px 10px;
        min-width: 180px;
        font-size: 0.78rem;
        color: var(--lv-white);
    }

    .legend-header {
        font-family: var(--font-mono);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--lv-silver);
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .legend-body {
        margin-top: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
    }

    .legend-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .halo-swatch {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--atlas-area-fill);
        border: 2px solid var(--atlas-halo);
        box-shadow: 0 0 6px rgba(255, 196, 0, 0.4);
    }

    .area-swatch {
        width: 12px;
        height: 12px;
        border-radius: 2px;
        background: var(--atlas-area-fill);
        border: 1px solid var(--atlas-area-stroke);
    }

    .dot-swatch {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        box-shadow: 0 0 4px rgba(0, 0, 0, 0.4);
    }

    .legend-divider {
        height: 1px;
        background: rgba(255, 255, 255, 0.08);
        margin: 2px 0;
    }

    .legend-note {
        color: var(--lv-silver);
        font-size: 0.72rem;
    }
</style>
