<template>
    <div class="country-selector d-flex align-center" style="gap: 6px">
        <span class="control-label">Country</span>
        <button
            v-for="c in countries"
            :key="c.code"
            type="button"
            class="country-chip"
            :class="{ active: state.country === c.code }"
            @click="setCountry(c.code as any)"
        >
            {{ c.code }}
        </button>
    </div>
</template>

<script setup lang="ts">
    const { state, setCountry } = useAtlasState();
    const countries = [
        { code: 'US', name: 'United States' },
        { code: 'UK', name: 'United Kingdom' },
        { code: 'CA', name: 'Canada' },
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

    .country-chip {
        padding: 4px 10px;
        border-radius: 6px;
        background: var(--lv-surface);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: var(--lv-silver);
        font-family: var(--font-mono);
        font-size: 0.75rem;
        letter-spacing: 0.05em;
        cursor: pointer;
        transition: all 150ms ease-out;
    }

    .country-chip:hover {
        border-color: var(--lv-green-dim);
        color: var(--lv-white);
    }

    .country-chip.active {
        background: rgba(63, 234, 0, 0.12);
        border-color: var(--lv-green);
        color: var(--lv-green-light);
    }
</style>
