<template>
    <div class="atlas-page">
        <AtlasControlRail />
        <div class="canvas-wrap">
            <AtlasMapCanvas />
            <AtlasLegend />
            <AtlasContextPanel />
        </div>
        <div class="footer-strip">
            <span class="mono">
                <v-icon icon="mdi-map-marker-multiple" size="x-small" class="mr-1" />
                {{ totalActiveStores.toLocaleString() }} stores ·
                {{ totalActiveAreas.toLocaleString() }} areas
            </span>
            <span class="mono muted">
                <v-icon icon="mdi-flag-checkered" size="x-small" class="mr-1" />
                Phase 1 · area-only context · per-store NEID resolution skipped (RED)
            </span>
            <span class="mono muted ml-auto">
                {{
                    pinned
                        ? 'pinned: ' + pinnedLabel
                        : 'click any polygon for context · ESC to clear'
                }}
            </span>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed, onMounted, onUnmounted } from 'vue';

    import AtlasContextPanel from '~/components/AtlasContextPanel.vue';
    import AtlasControlRail from '~/components/AtlasControlRail.vue';
    import AtlasLegend from '~/components/AtlasLegend.vue';
    import AtlasMapCanvas from '~/components/AtlasMapCanvas.vue';
    import { useAtlasData } from '~/composables/useAtlasData';
    import { useAtlasState } from '~/composables/useAtlasState';

    // Map canvas is the landing surface. `/atlas` is preserved as a route
    // alias so any pre-existing links (deep-linked retailer chips, prior
    // share URLs, the old landing page's hero CTA) continue to resolve.
    definePageMeta({
        alias: ['/atlas'],
    });

    useHead({
        title: 'Retail Atlas — Map Canvas',
        meta: [
            {
                name: 'description',
                content:
                    'Composable retail-store map: choose retailers, choose overlays, click any polygon for live Elemental context.',
            },
        ],
    });

    const { activeRetailers, country, pinned, clearPin } = useAtlasState();
    const { retailers, areas } = useAtlasData();

    const totalActiveStores = computed(() => {
        const list = retailers.value ?? [];
        return list
            .filter((r) => activeRetailers.value.includes(r.slug) && r.country === country.value)
            .reduce((s, r) => s + r.store_count, 0);
    });

    const totalActiveAreas = computed(() => {
        const list = areas.value ?? [];
        let n = 0;
        for (const a of list) {
            if (a.country !== country.value) continue;
            for (const slug of activeRetailers.value) {
                if ((a.store_counts_by_retailer[slug] ?? 0) > 0) {
                    n += 1;
                    break;
                }
            }
        }
        return n;
    });

    const pinnedLabel = computed(() => {
        const p = pinned.value;
        if (!p) return '';
        if (p.kind === 'area') return p.area_key;
        return `${p.retailer_slug}/${p.store_id}`;
    });

    function onKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape' && pinned.value) {
            clearPin();
        }
    }

    onMounted(() => {
        window.addEventListener('keydown', onKeydown);
    });
    onUnmounted(() => {
        window.removeEventListener('keydown', onKeydown);
    });
</script>

<style scoped>
    .atlas-page {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: calc(100vh - 64px); /* leave room for v-app-bar */
        overflow: hidden;
    }

    .canvas-wrap {
        position: relative;
        flex: 1 1 auto;
        overflow: hidden;
    }

    .footer-strip {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 6px 16px;
        background: rgba(20, 20, 20, 0.85);
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 0.75rem;
    }

    .mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }

    .muted {
        color: rgba(255, 255, 255, 0.45);
    }

    .ml-auto {
        margin-left: auto;
    }
</style>
