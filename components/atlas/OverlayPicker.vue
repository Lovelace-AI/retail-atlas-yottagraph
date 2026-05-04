<template>
    <div class="overlay-picker d-flex align-center" style="gap: 6px">
        <span class="control-label">Overlay</span>
        <v-select
            :model-value="state.overlay ?? '__none__'"
            @update:model-value="onChange"
            :items="items"
            density="compact"
            hide-details
            variant="outlined"
            class="overlay-select"
        />
    </div>
</template>

<script setup lang="ts">
    import type { Recipe } from '~/composables/useAtlasData';

    const props = defineProps<{ recipes: Recipe[] }>();
    const { state, setOverlay } = useAtlasState();

    const items = computed(() => [
        { title: 'None', value: '__none__' },
        ...props.recipes.map((r) => ({ title: r.label, value: r.recipe_id })),
    ]);

    function onChange(v: string) {
        setOverlay(v === '__none__' ? null : v);
    }
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

    .overlay-select {
        min-width: 220px;
    }

    :deep(.v-field__input) {
        font-family: var(--font-primary);
        font-size: 0.85rem;
        min-height: 32px;
        padding-top: 4px;
    }
</style>
