<template>
    <div class="time-window d-flex align-center" style="gap: 6px">
        <span class="control-label">Window</span>
        <button
            v-for="w in windows"
            :key="w.value"
            type="button"
            class="time-chip"
            :class="{ active: state.timeWindow === w.value }"
            @click="setTimeWindow(w.value as any)"
        >
            {{ w.label }}
        </button>
    </div>
</template>

<script setup lang="ts">
    const { state, setTimeWindow } = useAtlasState();
    const windows = [
        { value: '30d', label: '30d' },
        { value: '90d', label: '90d' },
        { value: '365d', label: '12m' },
        { value: 'all', label: 'All' },
    ];
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

    .time-chip {
        padding: 4px 10px;
        border-radius: 6px;
        background: var(--lv-surface);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: var(--lv-silver);
        font-family: var(--font-mono);
        font-size: 0.75rem;
        cursor: pointer;
        transition: all 150ms ease-out;
    }

    .time-chip:hover {
        border-color: var(--lv-green-dim);
        color: var(--lv-white);
    }

    .time-chip.active {
        background: rgba(63, 234, 0, 0.12);
        border-color: var(--lv-green);
        color: var(--lv-green-light);
    }
</style>
