<template>
    <div class="atlas-shell d-flex fill-height">
        <AtlasSidebar />

        <div class="atlas-main d-flex flex-column flex-grow-1">
            <div class="atlas-control-rail flex-shrink-0">
                <RetailerChips :retailers="retailers" />
                <div class="rail-divider" />
                <CountrySelector />
                <div class="rail-divider" />
                <TimeWindowSelector />
                <div class="rail-divider" />
                <OverlayPicker :recipes="recipes" />
            </div>

            <div class="atlas-canvas-wrap flex-grow-1">
                <v-progress-linear v-if="loading" indeterminate />
                <v-alert v-else-if="error" type="error" variant="tonal" closable class="ma-4">
                    {{ error }}
                </v-alert>
                <MapCanvas v-else :retailers="retailers" :areas="areas" :stores="stores" />
            </div>

            <div
                v-if="state.pinnedAreaCode || state.pinnedStoreId"
                class="atlas-context-dock flex-shrink-0"
            >
                <AreaContextPanel
                    v-if="pinnedArea"
                    :area="pinnedArea"
                    :retailers="retailers"
                    @close="clearPin"
                />
                <StoreContextPanel
                    v-else-if="pinnedStore"
                    :store="pinnedStore"
                    :area="pinnedStoreArea"
                    @close="clearPin"
                />
            </div>

            <AtlasFooterStrip class="flex-shrink-0" />
        </div>
    </div>
</template>

<script setup lang="ts">
    definePageMeta({
        // Page is an authenticated app surface (uses default app shell with header).
    });

    const { retailers, areas, stores, recipes, loading, error, load } = useAtlasData();
    const { state, clearPin } = useAtlasState();

    onMounted(() => {
        load();
    });

    const pinnedArea = computed(() =>
        state.pinnedAreaCode
            ? (areas.value.find((a) => a.area_code === state.pinnedAreaCode) ?? null)
            : null
    );

    const pinnedStore = computed(() =>
        state.pinnedStoreId
            ? (stores.value.find((s) => s.store_id === state.pinnedStoreId) ?? null)
            : null
    );

    const pinnedStoreArea = computed(() => {
        if (!pinnedStore.value) return null;
        return areas.value.find((a) => a.area_code === pinnedStore.value!.area_code) ?? null;
    });
</script>

<style scoped>
    .atlas-shell {
        height: 100%;
        background: var(--lv-black);
    }

    .atlas-main {
        min-width: 0;
        background: var(--lv-black);
    }

    .atlas-control-rail {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        padding: 10px 16px;
        background: var(--lv-surface);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .rail-divider {
        width: 1px;
        height: 24px;
        background: rgba(255, 255, 255, 0.08);
    }

    .atlas-canvas-wrap {
        position: relative;
        padding: 12px 16px;
        min-height: 360px;
        display: flex;
    }

    .atlas-canvas-wrap > :deep(.map-canvas) {
        flex: 1;
    }

    .atlas-context-dock {
        height: 38vh;
        min-height: 280px;
        max-height: 480px;
        padding: 0 16px 12px;
    }
</style>
