<template>
    <div class="d-flex flex-column fill-height pa-4 atlas-recipes">
        <div class="flex-shrink-0">
            <PageHeader title="Analysis Recipes" icon="mdi-bookmark-multiple" />
        </div>
        <div class="flex-grow-1 overflow-y-auto pt-4">
            <p class="text-medium-emphasis mb-4">
                MVP ships three canonical recipes (R7). Each serializes into the URL via compressed
                query params so links are shareable surfaces.
            </p>
            <v-row>
                <v-col v-for="r in recipes" :key="r.recipe_id" cols="12" md="4">
                    <v-card class="recipe-card pa-4 fill-height">
                        <div class="recipe-eyebrow">{{ r.overlay_kind }}</div>
                        <div class="recipe-title">{{ r.label }}</div>
                        <p class="recipe-blurb">{{ r.blurb }}</p>
                        <v-divider class="my-3" />
                        <div class="recipe-meta">
                            <div>
                                <span class="meta-label">Color scale</span>
                                {{ r.color_scale }}
                            </div>
                            <div v-if="r.default_time_window_months">
                                <span class="meta-label">Default window</span>
                                {{ r.default_time_window_months }} months
                            </div>
                        </div>
                        <v-btn
                            class="mt-4"
                            color="primary"
                            variant="tonal"
                            block
                            :to="{ path: '/atlas', query: { r: r.recipe_id } }"
                            prepend-icon="mdi-map"
                        >
                            Apply on canvas
                        </v-btn>
                    </v-card>
                </v-col>
            </v-row>

            <v-alert v-if="!recipes.length && !loading" type="info" variant="tonal" class="mt-4">
                No recipes loaded yet.
            </v-alert>
            <v-progress-linear v-if="loading" indeterminate class="mt-4" />
        </div>
    </div>
</template>

<script setup lang="ts">
    const { recipes, loading, load } = useAtlasData();
    onMounted(() => load());
</script>

<style scoped>
    .atlas-recipes {
        height: 100%;
    }

    .recipe-card {
        background: var(--lv-surface);
        border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .recipe-eyebrow {
        font-family: var(--font-mono);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--lv-silver);
    }

    .recipe-title {
        font-family: var(--font-headline);
        font-size: 1.15rem;
        margin: 4px 0 8px;
        color: var(--lv-white);
    }

    .recipe-blurb {
        color: var(--lv-silver);
        font-size: 0.88rem;
        line-height: 1.5;
    }

    .recipe-meta {
        font-family: var(--font-mono);
        font-size: 0.75rem;
        color: var(--lv-silver);
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .meta-label {
        text-transform: uppercase;
        font-size: 0.65rem;
        letter-spacing: 0.08em;
        opacity: 0.7;
        margin-right: 4px;
    }
</style>
