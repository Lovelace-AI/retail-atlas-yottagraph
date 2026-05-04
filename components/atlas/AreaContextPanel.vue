<template>
    <div class="context-panel">
        <div class="panel-header">
            <div>
                <div class="panel-eyebrow">Area</div>
                <div class="panel-title">
                    {{ area.area_name }}
                    <span class="panel-region">{{ area.region }}</span>
                </div>
                <div class="panel-meta">
                    {{ area.area_type.toUpperCase() }} · {{ area.area_code }} · NEID
                    <code>{{ area.neid }}</code>
                </div>
            </div>
            <v-btn icon="mdi-close" size="small" variant="text" @click="$emit('close')" />
        </div>

        <div class="store-counts">
            <div
                v-for="r in activeRetailerList"
                :key="r.slug"
                class="store-count-chip"
                :style="{ '--chip-color': r.color }"
            >
                <span class="chip-dot" />
                <span>{{ r.name }}</span>
                <span class="chip-count">{{ area.store_counts?.[r.slug] ?? 0 }}</span>
            </div>
        </div>

        <v-tabs v-model="tab" density="compact" class="panel-tabs">
            <v-tab value="events">Events</v-tab>
            <v-tab value="articles">Articles</v-tab>
            <v-tab value="concepts">Economic concepts</v-tab>
        </v-tabs>

        <div class="panel-body">
            <v-progress-linear v-if="loading" indeterminate />
            <v-alert v-else-if="error" type="warning" variant="tonal" density="compact">
                {{ error }}
            </v-alert>
            <template v-else-if="result">
                <v-window v-model="tab">
                    <v-window-item value="events">
                        <ContextItemList
                            :items="result.events"
                            empty-message="No area events in window."
                            empty-icon="mdi-calendar-blank"
                        />
                    </v-window-item>
                    <v-window-item value="articles">
                        <ContextItemList
                            :items="result.articles"
                            empty-message="No related articles."
                            empty-icon="mdi-newspaper-variant-outline"
                        />
                    </v-window-item>
                    <v-window-item value="concepts">
                        <ContextItemList
                            :items="result.concepts"
                            empty-message="No related economic concepts."
                            empty-icon="mdi-finance"
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
    import type { Area, Retailer } from '~/composables/useAtlasData';
    import type { AtlasContextResult } from '~/composables/useAtlasContext';

    const props = defineProps<{ area: Area; retailers: Retailer[] }>();
    defineEmits<{ close: [] }>();

    const { state } = useAtlasState();
    const { resolve } = useAtlasContext();

    const tab = ref('events');
    const loading = ref(false);
    const error = ref<string | null>(null);
    const result = ref<AtlasContextResult | null>(null);

    const activeRetailerList = computed(() =>
        props.retailers.filter((r) => state.retailers.has(r.slug))
    );

    async function load() {
        if (!props.area.neid) {
            error.value = 'This area has no Elemental NEID.';
            result.value = null;
            return;
        }
        loading.value = true;
        error.value = null;
        try {
            result.value = await resolve(props.area.neid, 'location', Array.from(state.retailers));
            if (result.value.error) error.value = result.value.error;
        } catch (e: any) {
            error.value = e?.message ?? 'Failed to load context';
        } finally {
            loading.value = false;
        }
    }

    watch(() => props.area.area_code, load, { immediate: true });
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
        line-height: 1.3;
        display: flex;
        align-items: baseline;
        gap: 10px;
    }

    .panel-region {
        font-family: var(--font-primary);
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

    .store-counts {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding: 8px 16px;
    }

    .store-count-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 2px 8px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--chip-color) 12%, var(--lv-surface));
        border: 1px solid var(--chip-color);
        font-size: 0.78rem;
    }

    .chip-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--chip-color);
    }

    .chip-count {
        font-family: var(--font-mono);
        font-size: 0.75rem;
        opacity: 0.85;
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
