<template>
    <div class="d-flex flex-column fill-height pa-4">
        <div class="flex-shrink-0">
            <PageHeader title="Retailers" icon="mdi-storefront" />
        </div>
        <div class="flex-grow-1 overflow-y-auto pt-4">
            <p class="text-medium-emphasis mb-4">
                Five retailers ship in MVP. Drop a new CSV into
                <code>@lovelace/retail-data</code> and run the build scripts to add another — no app
                code changes required.
            </p>
            <v-progress-linear v-if="loading" indeterminate class="mb-4" />
            <v-row>
                <v-col v-for="r in retailers" :key="r.slug" cols="12" sm="6" md="4">
                    <v-card class="retailer-card pa-4">
                        <div class="d-flex align-center mb-2" style="gap: 10px">
                            <span class="retailer-swatch" :style="{ background: r.color }" />
                            <span class="retailer-name">{{ r.name }}</span>
                            <v-chip size="x-small" variant="tonal" class="ml-auto">
                                {{ r.country }}
                            </v-chip>
                        </div>
                        <div class="retailer-meta">
                            <span class="meta-label">Default format</span>
                            {{ r.format_default }}
                        </div>
                        <div class="retailer-meta">
                            <span class="meta-label">Stores tracked</span>
                            {{ r.store_count_total.toLocaleString() }}
                        </div>
                        <v-btn
                            class="mt-4"
                            color="primary"
                            variant="tonal"
                            block
                            :to="{ path: '/atlas', query: { focus: r.slug } }"
                            prepend-icon="mdi-map"
                        >
                            Show on canvas
                        </v-btn>
                    </v-card>
                </v-col>
            </v-row>
        </div>
    </div>
</template>

<script setup lang="ts">
    const { retailers, loading, load } = useAtlasData();
    onMounted(() => load());
</script>

<style scoped>
    .retailer-card {
        background: var(--lv-surface);
        border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .retailer-swatch {
        width: 12px;
        height: 12px;
        border-radius: 3px;
    }

    .retailer-name {
        font-family: var(--font-headline);
        font-size: 1.05rem;
    }

    .retailer-meta {
        font-family: var(--font-mono);
        font-size: 0.78rem;
        color: var(--lv-silver);
        margin-top: 4px;
    }

    .meta-label {
        text-transform: uppercase;
        font-size: 0.65rem;
        letter-spacing: 0.08em;
        opacity: 0.7;
        margin-right: 6px;
    }
</style>
