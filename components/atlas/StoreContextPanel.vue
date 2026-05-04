<template>
    <div class="context-panel">
        <div class="panel-header">
            <div>
                <div class="panel-eyebrow">Store</div>
                <div class="panel-title">
                    {{ store.retailer_name }}
                    <span class="panel-region">#{{ store.store_number }}</span>
                </div>
                <div class="panel-meta">
                    {{ store.format }}{{ store.banner ? ' · ' + store.banner : '' }} ·
                    {{ store.address }}, {{ store.city }} · {{ store.region }}
                </div>
                <div v-if="store.neid" class="panel-meta">
                    NEID <code>{{ store.neid }}</code>
                </div>
                <div v-else class="panel-meta">No NEID — area context shown below</div>
            </div>
            <v-btn icon="mdi-close" size="small" variant="text" @click="$emit('close')" />
        </div>

        <v-tabs v-model="tab" density="compact" class="panel-tabs">
            <v-tab value="events">Events</v-tab>
            <v-tab value="articles">Articles</v-tab>
            <v-tab value="related">Related orgs</v-tab>
        </v-tabs>

        <div class="panel-body">
            <v-progress-linear v-if="loading" indeterminate />
            <v-alert v-else-if="error" type="warning" variant="tonal" density="compact">
                {{ error }}
            </v-alert>
            <template v-else-if="result">
                <div v-if="fallbackToArea" class="fallback-note">
                    Store has no direct Elemental events — showing context from
                    <strong>{{ store.area_name }}</strong>
                </div>
                <v-window v-model="tab">
                    <v-window-item value="events">
                        <ContextItemList
                            :items="result.events"
                            empty-message="No store-level events."
                            empty-icon="mdi-calendar-blank"
                        />
                    </v-window-item>
                    <v-window-item value="articles">
                        <ContextItemList
                            :items="result.articles"
                            empty-message="No hyperlocal press."
                            empty-icon="mdi-newspaper-variant-outline"
                        />
                    </v-window-item>
                    <v-window-item value="related">
                        <ContextItemList
                            :items="result.concepts"
                            empty-message="No linked orgs."
                            empty-icon="mdi-domain"
                        />
                    </v-window-item>
                </v-window>
            </template>
        </div>

        <div v-if="result" class="provenance">
            <span
                v-for="p in result.provenance"
                :key="p.tool"
                class="provenance-item"
                :class="{ failed: !p.ok }"
            >
                {{ p.tool }} · {{ p.duration_ms }}ms
            </span>
            <span class="provenance-cache" v-if="result.cached">cached</span>
        </div>
    </div>
</template>

<script setup lang="ts">
    import type { Area, Store } from '~/composables/useAtlasData';
    import type { AtlasContextResult } from '~/composables/useAtlasContext';

    const props = defineProps<{ store: Store; area: Area | null }>();
    defineEmits<{ close: [] }>();

    const { state } = useAtlasState();
    const { resolve } = useAtlasContext();

    const tab = ref('events');
    const loading = ref(false);
    const error = ref<string | null>(null);
    const result = ref<AtlasContextResult | null>(null);
    const fallbackToArea = ref(false);

    async function load() {
        loading.value = true;
        error.value = null;
        fallbackToArea.value = false;
        try {
            const targetNeid = props.store.neid ?? props.area?.neid ?? null;
            if (!targetNeid) {
                error.value = 'No NEID available for this store or its area.';
                result.value = null;
                return;
            }
            const flavor = props.store.neid ? 'organization' : 'location';
            result.value = await resolve(targetNeid, flavor, Array.from(state.retailers));
            if (!props.store.neid || (result.value.events.length === 0 && props.area?.neid)) {
                if (!props.store.neid) fallbackToArea.value = true;
            }
            if (result.value.error) error.value = result.value.error;
        } catch (e: any) {
            error.value = e?.message ?? 'Failed to load context';
        } finally {
            loading.value = false;
        }
    }

    watch(() => props.store.store_id, load, { immediate: true });
</script>

<style scoped>
    .context-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--lv-surface);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 8px;
        overflow: hidden;
    }

    .panel-header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .panel-eyebrow {
        font-family: var(--font-mono);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--lv-silver);
        margin-bottom: 2px;
    }

    .panel-title {
        font-family: var(--font-headline);
        font-size: 1.1rem;
        display: flex;
        align-items: baseline;
        gap: 10px;
    }

    .panel-region {
        font-family: var(--font-mono);
        font-size: 0.85rem;
        color: var(--lv-silver);
    }

    .panel-meta {
        font-family: var(--font-mono);
        font-size: 0.72rem;
        color: var(--lv-silver);
        margin-top: 4px;
    }

    .panel-meta code {
        background: transparent;
        padding: 0;
        color: var(--lv-green-light);
    }

    .panel-tabs {
        flex-shrink: 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .panel-body {
        flex: 1;
        overflow-y: auto;
        padding: 8px 16px 16px;
    }

    .fallback-note {
        background: rgba(255, 196, 0, 0.06);
        border: 1px solid rgba(255, 196, 0, 0.2);
        color: var(--lv-yellow);
        font-size: 0.78rem;
        padding: 6px 10px;
        border-radius: 6px;
        margin-bottom: 8px;
    }

    .provenance {
        flex-shrink: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 6px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        font-family: var(--font-mono);
        font-size: 0.66rem;
        color: var(--lv-silver);
        background: var(--lv-surface-light);
    }

    .provenance-item.failed {
        color: var(--lv-orange);
    }

    .provenance-cache {
        color: var(--lv-green);
        margin-left: auto;
    }
</style>
