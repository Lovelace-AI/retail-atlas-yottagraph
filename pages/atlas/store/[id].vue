<template>
    <div class="d-flex flex-column fill-height pa-4">
        <div class="flex-shrink-0">
            <PageHeader :title="title" icon="mdi-store" />
        </div>
        <div class="flex-grow-1 overflow-y-auto pt-4">
            <v-progress-linear v-if="loading" indeterminate />
            <v-alert v-else-if="!store" type="warning" variant="tonal" class="mt-2">
                Unknown store {{ id }}.
            </v-alert>
            <div v-else class="d-flex flex-column" style="gap: 16px">
                <v-btn
                    variant="text"
                    prepend-icon="mdi-arrow-left"
                    :to="{ path: '/atlas' }"
                    class="align-self-start"
                >
                    Back to canvas
                </v-btn>
                <div class="store-context-wrap">
                    <StoreContextPanel
                        :store="store"
                        :area="area"
                        @close="$router.push('/atlas')"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    const route = useRoute();
    const id = computed(() => String(route.params.id ?? ''));

    const { areas, stores, loading, load } = useAtlasData();

    onMounted(() => load());

    const store = computed(() => stores.value.find((s) => s.store_id === id.value) ?? null);

    const area = computed(() =>
        store.value
            ? (areas.value.find((a) => a.area_code === store.value!.area_code) ?? null)
            : null
    );

    const title = computed(() =>
        store.value
            ? `${store.value.retailer_name} #${store.value.store_number}`
            : `Store ${id.value}`
    );
</script>

<style scoped>
    .store-context-wrap {
        height: 70vh;
        min-height: 420px;
    }
</style>
