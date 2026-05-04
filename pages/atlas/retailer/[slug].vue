<template>
    <div class="d-flex flex-column fill-height pa-4">
        <div class="flex-shrink-0">
            <PageHeader :title="title" icon="mdi-storefront" />
        </div>
        <div class="flex-grow-1 overflow-y-auto pt-4">
            <v-progress-linear v-if="loading" indeterminate />
            <v-alert v-else-if="!retailer" type="warning" variant="tonal" class="mt-2">
                Unknown retailer {{ slug }}.
            </v-alert>
            <div v-else class="d-flex flex-column" style="gap: 24px">
                <v-card class="pa-4 retailer-summary">
                    <div class="d-flex align-center" style="gap: 12px">
                        <span class="retailer-swatch" :style="{ background: retailer.color }" />
                        <div>
                            <div class="retailer-name">{{ retailer.name }}</div>
                            <div class="retailer-meta">
                                {{ retailer.country }} ·
                                {{ retailer.store_count_total.toLocaleString() }} stores · default
                                format {{ retailer.format_default }}
                            </div>
                        </div>
                        <v-spacer />
                        <v-btn
                            color="primary"
                            variant="tonal"
                            prepend-icon="mdi-map"
                            :to="{ path: '/atlas', query: { focus: retailer.slug } }"
                        >
                            Show on canvas
                        </v-btn>
                    </div>
                </v-card>

                <div>
                    <div class="section-headline">Area presence</div>
                    <v-data-table
                        :headers="headers"
                        :items="rows"
                        density="comfortable"
                        hover
                        items-per-page="20"
                    >
                        <template #item.area="{ item }">
                            <NuxtLink :to="`/atlas/area/${item.area_code}`" class="atlas-link">
                                {{ item.area_name }}
                            </NuxtLink>
                            <span class="ml-2 text-medium-emphasis">{{ item.region }}</span>
                        </template>
                    </v-data-table>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
    const route = useRoute();
    const slug = computed(() => String(route.params.slug ?? ''));

    const { retailers, areas, loading, load } = useAtlasData();
    onMounted(() => load());

    const retailer = computed(() => retailers.value.find((r) => r.slug === slug.value) ?? null);

    const rows = computed(() => {
        if (!retailer.value) return [];
        return areas.value
            .filter((a) => (a.store_counts?.[retailer.value!.slug] ?? 0) > 0)
            .map((a) => ({
                area_code: a.area_code,
                area_name: a.area_name,
                region: a.region,
                area_type: a.area_type.toUpperCase(),
                store_count: a.store_counts?.[retailer.value!.slug] ?? 0,
                neid: a.neid ?? '—',
            }))
            .sort((x, y) => y.store_count - x.store_count);
    });

    const headers = [
        { title: 'Area', key: 'area', sortable: false },
        { title: 'Type', key: 'area_type' },
        { title: 'Stores', key: 'store_count', align: 'end' as const },
        { title: 'NEID', key: 'neid' },
    ];

    const title = computed(() => (retailer.value ? retailer.value.name : `Retailer ${slug.value}`));
</script>

<style scoped>
    .retailer-summary {
        background: var(--lv-surface);
        border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .retailer-swatch {
        width: 16px;
        height: 16px;
        border-radius: 4px;
    }

    .retailer-name {
        font-family: var(--font-headline);
        font-size: 1.2rem;
    }

    .retailer-meta {
        font-family: var(--font-mono);
        font-size: 0.78rem;
        color: var(--lv-silver);
    }

    .section-headline {
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.75rem;
        color: var(--lv-silver);
        margin-bottom: 8px;
    }

    .atlas-link {
        color: var(--lv-green-light);
        text-decoration: none;
    }

    .atlas-link:hover {
        text-decoration: underline;
    }
</style>
