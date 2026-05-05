<template>
    <div class="landing-page">
        <div class="landing-content">
            <div class="hero">
                <img src="/LL-logo-full-wht.svg" alt="Lovelace" class="hero-logo" />
                <div class="hero-eyebrow">A Lovelace product · Beta</div>
                <h1 class="hero-title">Retail Atlas</h1>
                <p class="hero-subtitle">
                    A composable retail-store map. Layer multiple retailers' footprints on the same
                    canvas, click any polygon or store dot for live Elemental context, and compose
                    cross-retailer analyses no comparable product delivers.
                </p>
                <div class="hero-cta">
                    <v-btn
                        size="large"
                        color="primary"
                        variant="flat"
                        prepend-icon="mdi-map"
                        to="/atlas"
                    >
                        Open the Atlas
                    </v-btn>
                </div>
            </div>

            <div class="stats-row">
                <div class="stat">
                    <div class="stat-num">30</div>
                    <div class="stat-label">Retailers</div>
                </div>
                <div class="stat">
                    <div class="stat-num">~148k</div>
                    <div class="stat-label">Store locations</div>
                </div>
                <div class="stat">
                    <div class="stat-num">3,601</div>
                    <div class="stat-label">Tracked areas</div>
                </div>
                <div class="stat">
                    <div class="stat-num">3</div>
                    <div class="stat-label">Countries (US/UK/CA)</div>
                </div>
            </div>

            <section class="roster">
                <h2 class="section-title">Tracked retailers</h2>
                <p class="section-help muted">
                    Click any chip to jump to the canvas with that retailer enabled.
                </p>
                <div v-if="loading" class="muted mono">Loading retailers…</div>
                <div v-else class="chip-grid">
                    <NuxtLink
                        v-for="r in retailerList"
                        :key="r.slug"
                        :to="{ path: '/atlas', query: { retailers: r.slug } }"
                        class="retailer-chip-link"
                    >
                        <v-chip variant="tonal" size="default" class="retailer-chip-card">
                            <span class="dot" :style="{ background: r.color }" />
                            <span class="retailer-name">{{ r.name }}</span>
                            <span class="muted mono">
                                {{ formatCount(r.store_count) }} ·
                                {{ r.country }}
                            </span>
                        </v-chip>
                    </NuxtLink>
                </div>
            </section>

            <section class="phasing">
                <h2 class="section-title">Status</h2>
                <ul class="phase-list">
                    <li>
                        <strong class="green">✓</strong> Data substrate: 30 retailers normalized
                        into a unified Store/Area schema.
                    </li>
                    <li>
                        <strong class="green">✓</strong> Topojson boundaries: US counties, UK LADs,
                        CA CMAs.
                    </li>
                    <li>
                        <strong class="amber">◐</strong> Phase 0 (store-NEID resolution): probed;
                        result was below the 30% threshold, so the per-store context surface
                        degrades gracefully to area context.
                    </li>
                    <li>
                        <strong class="green">✓</strong> Phase 1 R3: map canvas with retailer chips,
                        country selector, choropleth, and store dots.
                    </li>
                    <li>
                        <strong class="muted">…</strong> Phase 1 R6 (area context fan-out via
                        Elemental MCP): scaffolded; Nitro endpoint wiring is the next step.
                    </li>
                    <li>
                        <strong class="muted">…</strong> Phase 3 R4/R7 (multi-retailer overlays +
                        analysis recipes): backlog.
                    </li>
                </ul>
            </section>
        </div>
    </div>
</template>

<script setup lang="ts">
    import { computed, onMounted } from 'vue';

    import { useAtlasData } from '~/composables/useAtlasData';
    import type { RetailerSummary } from '~/types/retail';

    useHead({
        title: 'Retail Atlas — Lovelace',
    });

    const { loadRetailers, retailers, retailersLoading } = useAtlasData();

    onMounted(async () => {
        await loadRetailers();
    });

    const loading = retailersLoading;

    const retailerList = computed<RetailerSummary[]>(() => {
        const list = (retailers.value as RetailerSummary[] | null) ?? [];
        return [...list].sort((a, b) => {
            if (a.country !== b.country) return a.country.localeCompare(b.country);
            return b.store_count - a.store_count;
        });
    });

    function formatCount(n: number): string {
        if (n < 1_000) return String(n);
        if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
        return `${Math.round(n / 1_000)}k`;
    }
</script>

<style scoped>
    .landing-page {
        height: 100%;
        overflow-y: auto;
        padding: 48px 24px 80px;
        background: linear-gradient(180deg, #0a0a0a 0%, #141414 100%);
    }

    .landing-content {
        max-width: 1100px;
        margin: 0 auto;
    }

    .hero {
        text-align: center;
        margin-bottom: 56px;
    }

    .hero-logo {
        height: 1.75rem;
        width: auto;
        opacity: 0.55;
        margin-bottom: 24px;
    }

    .hero-eyebrow {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: rgba(255, 255, 255, 0.5);
        margin-bottom: 12px;
    }

    .hero-title {
        font-family: var(--font-headline, sans-serif);
        font-weight: 400;
        font-size: 3rem;
        line-height: 1.1;
        letter-spacing: 0.005em;
        margin-bottom: 16px;
    }

    .hero-subtitle {
        font-size: 1.1rem;
        line-height: 1.5;
        color: rgba(255, 255, 255, 0.7);
        max-width: 720px;
        margin: 0 auto 28px;
    }

    .hero-cta {
        display: flex;
        justify-content: center;
        gap: 12px;
    }

    .stats-row {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        margin-bottom: 56px;
    }

    .stat {
        background: rgba(28, 28, 28, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        padding: 16px;
        text-align: center;
    }

    .stat-num {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 2rem;
        font-weight: 500;
        color: var(--lv-green, #3fea00);
    }

    .stat-label {
        text-transform: uppercase;
        letter-spacing: 0.1em;
        font-size: 0.7rem;
        color: rgba(255, 255, 255, 0.55);
        margin-top: 4px;
    }

    .section-title {
        font-family: var(--font-headline, sans-serif);
        font-weight: 400;
        font-size: 1.25rem;
        letter-spacing: 0.02em;
        margin-bottom: 8px;
    }

    .section-help {
        font-size: 0.875rem;
        margin-bottom: 16px;
    }

    .roster {
        margin-bottom: 56px;
    }

    .chip-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
        gap: 8px;
    }

    .retailer-chip-link {
        text-decoration: none;
    }

    .retailer-chip-card {
        width: 100%;
        justify-content: flex-start;
        gap: 8px;
    }

    .dot {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
    }

    .retailer-name {
        flex: 1;
    }

    .muted {
        color: rgba(255, 255, 255, 0.45);
    }

    .mono {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.78em;
    }

    .green {
        color: #3fea00;
        margin-right: 6px;
    }

    .amber {
        color: #f5b800;
        margin-right: 6px;
    }

    .phase-list {
        list-style: none;
        padding-left: 0;
        font-size: 0.95rem;
        line-height: 1.6;
        color: rgba(255, 255, 255, 0.78);
    }

    .phase-list li {
        margin-bottom: 4px;
    }
</style>
