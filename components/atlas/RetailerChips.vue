<template>
    <div class="retailer-chips d-flex align-center flex-wrap" style="gap: 6px">
        <span class="control-label">Retailers</span>
        <button
            v-for="r in availableRetailers"
            :key="r.slug"
            type="button"
            class="retailer-chip"
            :class="{ active: isRetailerActive(r.slug) }"
            :style="{ '--chip-color': r.color }"
            @click="toggleRetailer(r.slug)"
        >
            <span class="chip-dot" />
            <span>{{ r.name }}</span>
        </button>
    </div>
</template>

<script setup lang="ts">
    import type { Retailer } from '~/composables/useAtlasData';

    const props = defineProps<{ retailers: Retailer[] }>();
    const { state, toggleRetailer, isRetailerActive } = useAtlasState();

    const availableRetailers = computed(() =>
        props.retailers.filter((r) => r.country === state.country)
    );
</script>

<style scoped>
    .control-label {
        font-family: var(--font-mono);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--lv-silver);
        margin-right: 4px;
    }

    .retailer-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 999px;
        background: var(--lv-surface);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: var(--lv-silver);
        font-family: var(--font-primary);
        font-size: 0.78rem;
        cursor: pointer;
        transition:
            background 150ms ease-out,
            border-color 150ms ease-out,
            color 150ms ease-out;
    }

    .retailer-chip:hover {
        border-color: var(--chip-color);
        color: var(--lv-white);
    }

    .retailer-chip.active {
        background: color-mix(in srgb, var(--chip-color) 12%, var(--lv-surface));
        border-color: var(--chip-color);
        color: var(--lv-white);
    }

    .chip-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--chip-color);
        opacity: 0.5;
    }

    .retailer-chip.active .chip-dot {
        opacity: 1;
    }
</style>
