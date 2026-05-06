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
                <v-tab value="events" :disabled="!areaPin">
                    Area events
                    <v-chip
                        v-if="contextData?.area_events.length"
                        size="x-small"
                        class="ml-2"
                        variant="tonal"
                    >
                        {{ contextData.area_events.length }}
                    </v-chip>
                </v-tab>
                <v-tab value="retailer_events" :disabled="!areaPin || !hasRetailerEvents">
                    Retailer events
                    <v-chip
                        v-if="totalRetailerEvents > 0"
                        size="x-small"
                        class="ml-2"
                        variant="tonal"
                    >
                        {{ totalRetailerEvents }}
                    </v-chip>
                </v-tab>
                <v-tab value="articles" :disabled="!areaPin">
                    Articles
                    <v-chip
                        v-if="contextData?.area_articles.length"
                        size="x-small"
                        class="ml-2"
                        variant="tonal"
                    >
                        {{ contextData.area_articles.length }}
                    </v-chip>
                </v-tab>
                <v-tab value="concepts" :disabled="!areaPin">
                    Economic concepts
                    <v-chip
                        v-if="contextData?.economic_concepts.length"
                        size="x-small"
                        class="ml-2"
                        variant="tonal"
                    >
                        {{ contextData.economic_concepts.length }}
                    </v-chip>
                </v-tab>
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
                        <div v-if="contextLoading" class="muted">Loading events…</div>
                        <div v-else-if="contextError" class="error-msg">
                            {{ contextError }}
                        </div>
                        <div
                            v-else-if="contextData && contextData.area_events.length"
                            class="event-list"
                        >
                            <div
                                v-for="ev in contextData.area_events"
                                :key="ev.neid || ev.summary"
                                class="event-row"
                            >
                                <div class="event-meta mono muted">
                                    <span v-if="ev.ts">{{ ev.ts }}</span>
                                    <span v-else>—</span>
                                    <span v-if="ev.kind" class="event-kind">{{ ev.kind }}</span>
                                    <span
                                        v-if="ev.likelihood"
                                        class="event-likelihood"
                                        :class="`likelihood-${(ev.likelihood || '').toLowerCase()}`"
                                    >
                                        {{ ev.likelihood }}
                                    </span>
                                </div>
                                <div class="event-summary">{{ ev.summary }}</div>
                            </div>
                        </div>
                        <div v-else class="muted-block">
                            No area events returned. This area may not have any tracked events in
                            the time window, or its NEID may not yet be resolved (run
                            <code class="mono">npm run expand:areas</code>).
                        </div>
                    </v-window-item>

                    <v-window-item value="retailer_events">
                        <div v-if="contextLoading" class="muted">Loading retailer events…</div>
                        <div v-else-if="contextError" class="error-msg">
                            {{ contextError }}
                        </div>
                        <div
                            v-else-if="
                                contextData && Object.keys(contextData.retailer_events).length > 0
                            "
                        >
                            <div
                                v-for="(events, slug) in contextData.retailer_events"
                                :key="slug"
                                class="retailer-events-group"
                            >
                                <div class="retailer-events-header">
                                    <span
                                        class="chip-dot"
                                        :style="{ background: retailerColor(slug) }"
                                    />
                                    <span class="retailer-name">{{ retailerName(slug) }}</span>
                                    <span class="mono muted">
                                        {{ events.length || 'no events' }}
                                    </span>
                                </div>
                                <div v-if="events.length" class="event-list">
                                    <div
                                        v-for="ev in events"
                                        :key="ev.neid || ev.summary"
                                        class="event-row"
                                        :style="{
                                            borderLeftColor: retailerColor(slug),
                                        }"
                                    >
                                        <div class="event-meta mono muted">
                                            <span v-if="ev.ts">{{ ev.ts }}</span>
                                            <span v-else>—</span>
                                            <span v-if="ev.kind" class="event-kind">
                                                {{ ev.kind }}
                                            </span>
                                        </div>
                                        <div class="event-summary">{{ ev.summary }}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div v-else class="muted-block">
                            No retailer events. Toggle a retailer chip with a resolved org NEID to
                            see corporate-level events.
                        </div>
                    </v-window-item>
                    <v-window-item value="articles">
                        <div v-if="contextLoading" class="muted">Loading articles…</div>
                        <div v-else-if="contextError" class="error-msg">
                            {{ contextError }}
                        </div>
                        <div
                            v-else-if="contextData && contextData.area_articles.length"
                            class="article-list"
                        >
                            <div
                                v-for="a in contextData.area_articles"
                                :key="a.neid"
                                class="article-row"
                            >
                                <div class="article-title">{{ a.title }}</div>
                                <div class="article-meta mono muted">
                                    <span v-if="a.published_at">{{ a.published_at }}</span>
                                    <span v-else>—</span>
                                    <span v-if="a.publisher" class="dot-sep">·</span>
                                    <span v-if="a.publisher">{{ a.publisher }}</span>
                                </div>
                                <div
                                    v-if="a.topic || a.tone || a.title_factuality"
                                    class="article-tags"
                                >
                                    <v-chip
                                        v-if="a.topic"
                                        size="x-small"
                                        variant="tonal"
                                        class="article-tag"
                                    >
                                        {{ a.topic }}
                                    </v-chip>
                                    <v-chip
                                        v-if="a.tone"
                                        size="x-small"
                                        variant="tonal"
                                        class="article-tag"
                                        color="info"
                                    >
                                        tone: {{ a.tone }}
                                    </v-chip>
                                    <v-chip
                                        v-if="a.title_factuality"
                                        size="x-small"
                                        variant="tonal"
                                        class="article-tag"
                                        :color="
                                            a.title_factuality === 'sensational'
                                                ? 'warning'
                                                : 'success'
                                        "
                                    >
                                        {{ a.title_factuality }}
                                    </v-chip>
                                </div>
                            </div>
                        </div>
                        <div v-else class="muted-block">
                            No articles linked to this area yet, or the area NEID hasn't been
                            resolved (run <code class="mono">npm run expand:areas</code>).
                        </div>
                    </v-window-item>
                    <v-window-item value="concepts">
                        <div v-if="contextLoading" class="muted">Loading concepts…</div>
                        <div v-else-if="contextError" class="error-msg">
                            {{ contextError }}
                        </div>
                        <div
                            v-else-if="contextData && contextData.economic_concepts.length"
                            class="concept-list"
                        >
                            <v-chip
                                v-for="c in contextData.economic_concepts"
                                :key="c.neid"
                                size="small"
                                variant="tonal"
                                class="ma-1"
                            >
                                {{ c.name }}
                            </v-chip>
                        </div>
                        <div v-else class="muted-block">
                            No economic concepts linked to this area.
                        </div>
                    </v-window-item>
                </v-window>
            </div>

            <div v-if="contextData" class="provenance">
                <span v-if="contextData.cache_hit" class="mono muted">cache hit</span>
                <span v-else class="mono muted"> fan-out {{ contextData.elapsed_ms }}ms </span>
            </div>
        </div>
    </transition>
</template>

<script setup lang="ts">
    import { computed, ref, watch } from 'vue';

    import { useAreaContext } from '~/composables/useAreaContext';
    import { useAtlasData } from '~/composables/useAtlasData';
    import { usePerfMarks } from '~/composables/usePerfMarks';
    import { useAtlasState } from '~/composables/useAtlasState';
    import type { AreaRecord, RetailerSummary, StoreRecord } from '~/types/retail';

    const { pinned, activeRetailers, clearPin } = useAtlasState();
    const { areas, retailers, stores } = useAtlasData();
    const {
        load: loadAreaContext,
        reset: resetAreaContext,
        loading: contextLoading,
        error: contextError,
        data: contextData,
    } = useAreaContext();
    const { startPanelOpen, finishPanelOpen, cancelPanelOpen } = usePerfMarks();

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

    const totalRetailerEvents = computed(() => {
        const m = contextData.value?.retailer_events ?? {};
        let n = 0;
        for (const slug of Object.keys(m)) {
            n += (m[slug] ?? []).length;
        }
        return n;
    });

    const hasRetailerEvents = computed(() => {
        const list = retailers.value as RetailerSummary[] | null;
        if (!list) return false;
        return activeRetailers.value.some((slug) =>
            list.find((r) => r.slug === slug && r.org_neid)
        );
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

    watch(
        () => [pinned.value, area.value, activeRetailers.value],
        () => {
            const a = area.value;
            const p = pinned.value;
            if (!p) {
                cancelPanelOpen();
                resetAreaContext();
                tab.value = 'overview';
                return;
            }
            if (p.kind !== 'area') {
                cancelPanelOpen();
                resetAreaContext();
                return;
            }
            // Fire fan-out for the pinned area. The composable handles caching
            // by `(area_neid, area_key, retailers_hash)`; if the area has no
            // resolved NEID, it returns an empty payload.
            startPanelOpen(p.area_key);
            loadAreaContext({
                area_key: p.area_key,
                area_neid: a?.neid ?? null,
                retailers: activeRetailers.value,
            });
        },
        { immediate: true }
    );

    watch(
        contextLoading,
        (loading, prev) => {
            if (!prev || loading) return;
            const isError = !!contextError.value;
            finishPanelOpen(isError ? 'error' : 'ok', contextData.value?.cache_hit ?? false);
        },
        { immediate: false }
    );
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

    .muted-block {
        color: rgba(255, 255, 255, 0.55);
        font-size: 0.875rem;
        line-height: 1.5;
        padding: 16px 0;
        max-width: 720px;
    }

    .muted-block code {
        background: rgba(255, 255, 255, 0.05);
        padding: 2px 6px;
        border-radius: 3px;
    }

    .article-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding-top: 8px;
    }

    .article-row {
        display: block;
        padding: 8px 10px;
        border-radius: 4px;
        color: inherit;
    }

    .article-tags {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        margin-top: 4px;
    }

    .article-tag {
        font-size: 0.65rem !important;
    }

    .article-title {
        font-size: 0.9rem;
        line-height: 1.35;
        margin-bottom: 2px;
    }

    .article-meta {
        font-size: 0.7rem;
        display: flex;
        gap: 6px;
        align-items: center;
    }

    .dot-sep {
        opacity: 0.4;
    }

    .concept-list {
        padding-top: 8px;
    }

    .event-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 8px;
    }

    .event-row {
        padding: 8px 10px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.02);
        border-left: 3px solid rgba(255, 255, 255, 0.15);
    }

    .event-meta {
        display: flex;
        gap: 8px;
        align-items: center;
        font-size: 0.7rem;
        margin-bottom: 3px;
    }

    .event-kind {
        text-transform: uppercase;
        letter-spacing: 0.08em;
        font-size: 0.65rem;
        padding: 1px 6px;
        background: rgba(255, 255, 255, 0.06);
        border-radius: 2px;
        color: rgba(255, 255, 255, 0.7);
    }

    .event-likelihood {
        font-size: 0.65rem;
        padding: 1px 6px;
        border-radius: 2px;
        text-transform: lowercase;
    }

    .likelihood-confirmed {
        background: rgba(63, 234, 0, 0.12);
        color: #7eea50;
    }

    .likelihood-ongoing {
        background: rgba(0, 59, 255, 0.12);
        color: #6090ff;
    }

    .likelihood-likely {
        background: rgba(255, 215, 0, 0.12);
        color: #f5d000;
    }

    .likelihood-speculative {
        background: rgba(255, 92, 0, 0.12);
        color: #f5945c;
    }

    .event-summary {
        font-size: 0.875rem;
        line-height: 1.45;
    }

    .retailer-events-group {
        margin-bottom: 16px;
    }

    .retailer-events-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
        font-size: 0.85rem;
    }

    .error-msg {
        color: #ef4444;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.85rem;
        padding: 12px;
        background: rgba(239, 68, 68, 0.05);
        border: 1px solid rgba(239, 68, 68, 0.25);
        border-radius: 6px;
    }

    .provenance {
        padding: 6px 16px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 0.7rem;
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
