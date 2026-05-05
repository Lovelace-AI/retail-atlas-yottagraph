<template>
    <transition name="slide-up">
        <div v-if="pinned" class="context-panel">
            <div class="panel-header">
                <div class="header-main">
                    <div class="header-title">
                        {{ headerTitle }}
                    </div>
                    <div class="header-meta">
                        <span class="mono muted">{{ headerMeta }}</span>
                    </div>
                </div>
                <v-btn
                    icon="mdi-close"
                    variant="text"
                    size="small"
                    @click="clearPin"
                    aria-label="Close panel"
                />
            </div>

            <v-tabs v-model="tab" density="compact" color="primary" align-tabs="start">
                <v-tab value="overview">Overview</v-tab>
                <v-tab value="events" :disabled="!areaPin">Area events</v-tab>
                <v-tab value="articles" :disabled="!areaPin">Articles</v-tab>
                <v-tab value="concepts" :disabled="!areaPin">Economic concepts</v-tab>
            </v-tabs>

            <div class="panel-body">
                <v-window v-model="tab">
                    <v-window-item value="overview">
                        <div v-if="areaPin">
                            <div class="kv-grid">
                                <div class="kv-row">
                                    <div class="k">Area key</div>
                                    <div class="v mono">{{ areaPin.area_key }}</div>
                                </div>
                                <div class="kv-row" v-if="area">
                                    <div class="k">Type</div>
                                    <div class="v">{{ area.area_type }}</div>
                                </div>
                                <div class="kv-row" v-if="area">
                                    <div class="k">Code</div>
                                    <div class="v mono">{{ area.area_code }}</div>
                                </div>
                                <div class="kv-row" v-if="area">
                                    <div class="k">Country</div>
                                    <div class="v">{{ area.country }}</div>
                                </div>
                                <div class="kv-row" v-if="area">
                                    <div class="k">Total stores</div>
                                    <div class="v">{{ area.total_stores.toLocaleString() }}</div>
                                </div>
                                <div class="kv-row" v-if="area">
                                    <div class="k">NEID</div>
                                    <div class="v mono">
                                        {{ area.neid ?? '— not yet resolved (Phase 1.5)' }}
                                    </div>
                                </div>
                            </div>

                            <div class="section-title mt-4">By retailer</div>
                            <div class="retailer-counts">
                                <div
                                    v-for="(c, slug) in retailerCounts"
                                    :key="slug"
                                    class="retailer-count-row"
                                >
                                    <span
                                        class="chip-dot"
                                        :style="{ background: retailerColor(slug) }"
                                    />
                                    <span class="retailer-name">
                                        {{ retailerName(slug) }}
                                    </span>
                                    <span class="mono">{{ c.toLocaleString() }}</span>
                                </div>
                                <div v-if="!Object.keys(retailerCounts).length" class="muted">
                                    No active retailers operate stores in this area.
                                </div>
                            </div>
                        </div>

                        <div v-else-if="storePin">
                            <div class="kv-grid">
                                <div class="kv-row">
                                    <div class="k">Store ID</div>
                                    <div class="v mono">{{ storePin.store_id }}</div>
                                </div>
                                <div class="kv-row">
                                    <div class="k">Retailer</div>
                                    <div class="v">{{ retailerName(storePin.retailer_slug) }}</div>
                                </div>
                                <div class="kv-row" v-if="store">
                                    <div class="k">Address</div>
                                    <div class="v">
                                        {{ store.address }}, {{ store.city }}, {{ store.region }}
                                        {{ store.postal_code }}
                                    </div>
                                </div>
                                <div class="kv-row" v-if="store">
                                    <div class="k">Format</div>
                                    <div class="v">{{ store.format ?? '—' }}</div>
                                </div>
                                <div class="kv-row" v-if="store">
                                    <div class="k">Coordinates</div>
                                    <div class="v mono">{{ store.lat }}, {{ store.lng }}</div>
                                </div>
                                <div class="kv-row" v-if="store">
                                    <div class="k">Area</div>
                                    <div class="v mono">
                                        {{ store.area_type }}:{{ store.area_code }}
                                    </div>
                                </div>
                            </div>

                            <div class="phase0-note mt-4">
                                <v-icon icon="mdi-information" size="small" class="mr-2" />
                                Per-store Elemental context is opportunistic in this build (Phase 0
                                store-NEID resolution returned RED, &lt; 30% hit-rate). Click the
                                pinned area for the surrounding county / LAD / CMA's events,
                                articles, and economic concepts.
                            </div>
                        </div>
                    </v-window-item>

                    <v-window-item value="events">
                        <ContextStub label="Area events" />
                    </v-window-item>
                    <v-window-item value="articles">
                        <ContextStub label="Articles" />
                    </v-window-item>
                    <v-window-item value="concepts">
                        <ContextStub label="Economic concepts" />
                    </v-window-item>
                </v-window>
            </div>
        </div>
    </transition>
</template>

<script setup lang="ts">
    import { computed, h, ref, watch } from 'vue';

    import { useAtlasData } from '~/composables/useAtlasData';
    import { useAtlasState } from '~/composables/useAtlasState';
    import type { AreaRecord, RetailerSummary, StoreRecord } from '~/types/retail';

    const { pinned, clearPin } = useAtlasState();
    const { areas, retailers, stores } = useAtlasData();

    const tab = ref<string>('overview');

    const areaPin = computed(() => (pinned.value?.kind === 'area' ? pinned.value : null));
    const storePin = computed(() => (pinned.value?.kind === 'store' ? pinned.value : null));

    const area = computed<AreaRecord | null>(() => {
        const pin = areaPin.value;
        if (!pin) return null;
        const list = areas.value ?? [];
        return list.find((a) => a.area_key === pin.area_key) ?? null;
    });

    const store = computed<StoreRecord | null>(() => {
        const pin = storePin.value;
        if (!pin) return null;
        const list = stores.value[pin.retailer_slug] ?? [];
        return list.find((s) => s.store_id === pin.store_id) ?? null;
    });

    const retailerCounts = computed(() => {
        const a = area.value;
        if (!a) return {};
        const out: Record<string, number> = {};
        for (const slug of Object.keys(a.store_counts_by_retailer)) {
            const c = a.store_counts_by_retailer[slug];
            if (c > 0) out[slug] = c;
        }
        return out;
    });

    function retailerName(slug: string): string {
        const list = retailers.value as RetailerSummary[] | null;
        return list?.find((r) => r.slug === slug)?.name ?? slug;
    }

    function retailerColor(slug: string): string {
        const list = retailers.value as RetailerSummary[] | null;
        return list?.find((r) => r.slug === slug)?.color ?? '#888';
    }

    const headerTitle = computed(() => {
        if (areaPin.value) {
            return area.value?.area_name ?? areaPin.value.area_key;
        }
        if (storePin.value) {
            return store.value
                ? `${retailerName(storePin.value.retailer_slug)} · ${store.value.city ?? store.value.address ?? store.value.store_id}`
                : `Store ${storePin.value.store_id}`;
        }
        return '';
    });

    const headerMeta = computed(() => {
        if (areaPin.value) {
            const a = area.value;
            if (!a) return areaPin.value.area_key;
            return `${a.country} · ${a.area_type} · ${a.area_code} · ${a.total_stores.toLocaleString()} total stores`;
        }
        if (storePin.value) {
            return storePin.value.store_id;
        }
        return '';
    });

    watch(pinned, (v) => {
        if (!v) tab.value = 'overview';
    });

    // Inline lightweight stub for empty tabs.
    const ContextStub = (props: { label: string }) =>
        h('div', { class: 'context-stub' }, [
            h('div', { class: 'muted mono' }, `${props.label} pending`),
            h(
                'div',
                { class: 'context-stub-help' },
                'The Phase-1 fan-out endpoint at /api/atlas/area-context is not yet wired. ' +
                    'When it lands (R6.1), this tab will show area-level events, articles, ' +
                    'or economic concepts traversed via Elemental MCP.'
            ),
        ]);
</script>

<style scoped>
    .context-panel {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        max-height: 45vh;
        background: rgba(20, 20, 20, 0.96);
        backdrop-filter: blur(8px);
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 10;
    }

    .panel-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: 12px 16px 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .header-title {
        font-family: var(--font-headline, sans-serif);
        font-size: 1.1rem;
        font-weight: 500;
        line-height: 1.3;
    }

    .header-meta {
        font-size: 0.8rem;
        margin-top: 2px;
    }

    .panel-body {
        overflow-y: auto;
        padding: 12px 16px 16px;
    }

    .kv-grid {
        display: grid;
        grid-template-columns: 130px 1fr;
        row-gap: 6px;
        column-gap: 16px;
        font-size: 0.875rem;
    }

    .kv-row {
        display: contents;
    }

    .k {
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
        font-size: 0.7rem;
        letter-spacing: 0.06em;
        padding-top: 2px;
    }

    .v {
        word-break: break-word;
    }

    .mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }

    .muted {
        color: rgba(255, 255, 255, 0.45);
    }

    .section-title {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.7rem;
        color: rgba(255, 255, 255, 0.55);
    }

    .retailer-counts {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin-top: 6px;
        font-size: 0.875rem;
    }

    .retailer-count-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .retailer-name {
        flex: 1;
    }

    .chip-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
    }

    .phase0-note {
        font-size: 0.8rem;
        color: rgba(255, 255, 255, 0.6);
        background: rgba(255, 215, 0, 0.06);
        border: 1px solid rgba(255, 215, 0, 0.18);
        border-radius: 6px;
        padding: 8px 10px;
    }

    :deep(.context-stub) {
        padding: 16px 0;
    }

    :deep(.context-stub-help) {
        margin-top: 8px;
        font-size: 0.85rem;
        color: rgba(255, 255, 255, 0.55);
        max-width: 720px;
        line-height: 1.5;
    }

    .slide-up-enter-active,
    .slide-up-leave-active {
        transition:
            transform 200ms ease-out,
            opacity 200ms ease-out;
    }

    .slide-up-enter-from,
    .slide-up-leave-to {
        transform: translateY(40px);
        opacity: 0;
    }
</style>
