<template>
    <div class="d-flex flex-column fill-height pa-4">
        <div class="flex-shrink-0">
            <PageHeader :title="title" icon="mdi-map-marker" />
        </div>
        <div class="flex-grow-1 overflow-y-auto pt-4">
            <v-progress-linear v-if="loading" indeterminate />
            <v-alert v-else-if="!area" type="warning" variant="tonal" class="mt-2">
                Unknown area code {{ code }}.
            </v-alert>
            <div v-else class="d-flex flex-column" style="gap: 16px">
                <v-btn
                    variant="text"
                    prepend-icon="mdi-arrow-left"
                    :to="{ path: '/atlas' }"
                    class="align-self-start"
                    @click="pinArea(area.area_code)"
                >
                    Back to canvas
                </v-btn>
                <div class="area-context-wrap">
                    <AreaContextPanel
                        :area="area"
                        :retailers="retailers"
                        @close="$router.push('/atlas')"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    const route = useRoute();
    const code = computed(() => String(route.params.code ?? ''));

    const { retailers, areas, loading, load } = useAtlasData();
    const { pinArea } = useAtlasState();

    onMounted(() => load());

    const area = computed(() => areas.value.find((a) => a.area_code === code.value) ?? null);

    const title = computed(() =>
        area.value ? `${area.value.area_name}, ${area.value.region}` : `Area ${code.value}`
    );
</script>

<style scoped>
    .area-context-wrap {
        height: 70vh;
        min-height: 420px;
    }
</style>
