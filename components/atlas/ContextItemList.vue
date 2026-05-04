<template>
    <div>
        <v-empty-state
            v-if="!items.length"
            :headline="emptyMessage"
            :icon="emptyIcon"
            class="atlas-empty-state"
        />
        <v-list v-else lines="two" density="compact" class="bg-transparent">
            <v-list-item
                v-for="it in items"
                :key="it.neid"
                :title="it.name || it.neid"
                :subtitle="it.neid"
                class="context-item"
            />
        </v-list>
    </div>
</template>

<script setup lang="ts">
    interface Item {
        neid: string;
        name: string;
    }
    withDefaults(
        defineProps<{
            items: Item[];
            emptyMessage?: string;
            emptyIcon?: string;
        }>(),
        { emptyMessage: 'No items', emptyIcon: 'mdi-database-off' }
    );
</script>

<style scoped>
    .context-item {
        border-radius: 6px;
        margin-bottom: 2px;
    }

    .context-item :deep(.v-list-item-subtitle) {
        font-family: var(--font-mono);
        font-size: 0.7rem;
        color: var(--lv-silver);
    }

    .atlas-empty-state {
        opacity: 0.7;
    }
</style>
