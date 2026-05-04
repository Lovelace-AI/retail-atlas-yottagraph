<template>
    <div class="d-flex flex-column fill-height pa-4">
        <div class="flex-shrink-0">
            <PageHeader title="Docs" icon="mdi-book-open-variant" />
        </div>
        <div class="flex-grow-1 overflow-y-auto pt-4 docs-body">
            <section>
                <h2>Architecture</h2>
                <p>
                    Retail Atlas is structured around three concentric pieces: a data layer, a
                    shared rendering core, and the product surface. The data layer is a set of
                    bundled JSON files (retailers, areas, stores, NEID caches). The rendering core
                    is the <code>MapCanvas</code> + context-panel pair plus the Elemental MCP
                    client. The product surface is this app — routes, auth, telemetry.
                </p>
            </section>

            <section>
                <h2>Layer system</h2>
                <ol>
                    <li><strong>Country silhouette</strong> — bounded by the projection</li>
                    <li><strong>Administrative polygons</strong> — county / LAD / CMA</li>
                    <li>
                        <strong>Retailer choropleths</strong> — lead retailer renders as a
                        sequential fill; others render as pattern overlays
                    </li>
                    <li>
                        <strong>NEID halo</strong> — every area with a resolved NEID + ≥1
                        active-retailer store gets the halo
                    </li>
                    <li><strong>Store dots</strong> — one color per retailer, sized by format</li>
                    <li><strong>Analysis overlay</strong> — chosen from the recipe library</li>
                    <li><strong>Pinned outline</strong> — the currently-pinned area or store</li>
                </ol>
            </section>

            <section>
                <h2>Phasing</h2>
                <p>
                    Phase 0 is the Elemental store-level coverage probe (R5.1). If the per-store
                    hit-rate is under 30%, the product pivots to area-only and Phase 2 is cancelled.
                    Phase 1 ships the MVP map canvas (R1, R2, R3) with five retailers and area-level
                    clicks only. Phase 2 adds store-level NEID resolution and the per-store context
                    panel. Phase 3 is the cross-retailer overlays and the three canonical recipes —
                    the product differentiator. Phase 4 layers in premium-feed composition. Phase 5
                    hardens for multi-tenant and seat-based billing.
                </p>
            </section>

            <section>
                <h2>Source data</h2>
                <ul>
                    <li>
                        <code>public/data/retail-atlas/retailers.json</code> — five MVP retailers +
                        per-retailer color tokens
                    </li>
                    <li>
                        <code>public/data/retail-atlas/areas.json</code> — counties (US), LADs (UK),
                        CMAs (CA) with NEIDs and per-retailer store counts
                    </li>
                    <li>
                        <code>public/data/retail-atlas/stores.json</code> — sample store roster
                        generated from <code>scripts/generate-sample-stores.js</code>
                    </li>
                    <li>
                        <code>public/data/retail-atlas/recipes.json</code> — the three canonical
                        analysis recipes
                    </li>
                </ul>
            </section>

            <section>
                <h2>Live context</h2>
                <p>
                    Click any halo polygon to load an Area Context Panel. The panel fans out to the
                    Elemental Query Server (events, articles, economic concepts) via the gateway
                    helpers in <code>utils/elementalHelpers</code>. Per-NEID results are cached
                    in-memory for the session. Cache hits, per-tool latency, and failures are
                    surfaced in the panel footer.
                </p>
            </section>
        </div>
    </div>
</template>

<script setup lang="ts"></script>

<style scoped>
    .docs-body {
        max-width: 880px;
        line-height: 1.6;
    }

    section {
        margin-bottom: 32px;
    }

    h2 {
        font-family: var(--font-headline);
        font-weight: 400;
        font-size: 1.2rem;
        color: var(--lv-white);
        margin-bottom: 12px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        padding-bottom: 6px;
    }

    p,
    li {
        color: var(--lv-silver);
    }

    code {
        font-family: var(--font-mono);
        background: var(--lv-surface);
        padding: 2px 6px;
        border-radius: 3px;
        color: var(--lv-green-light);
    }

    ol,
    ul {
        padding-left: 24px;
    }

    li {
        margin-bottom: 6px;
    }
</style>
