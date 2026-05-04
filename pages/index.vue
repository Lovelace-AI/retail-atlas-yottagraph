<template>
    <div class="landing">
        <div class="landing-hero lv-dot-grid">
            <div class="landing-hero-inner">
                <div class="hero-eyebrow">Retail Atlas · Beta</div>
                <h1 class="hero-title">A live, multi-retailer map of physical retail.</h1>
                <p class="hero-subtitle">
                    Five retailers. Three countries. Every store is a click target. Every
                    Elemental-tracked area is a context entry point — events, articles, economic
                    concepts, retailer-level news, all resolved on demand.
                </p>
                <div class="hero-actions">
                    <v-btn
                        color="primary"
                        size="large"
                        prepend-icon="mdi-map"
                        to="/atlas"
                        class="cta-btn"
                    >
                        Open the Atlas
                    </v-btn>
                    <v-btn
                        variant="outlined"
                        size="large"
                        prepend-icon="mdi-bookmark-multiple"
                        to="/atlas/recipes"
                        class="cta-btn-outline"
                    >
                        Browse recipes
                    </v-btn>
                </div>
                <div class="hero-meta">
                    <span>Target · Walmart · Dollar General · Tesco · Loblaw</span>
                </div>
            </div>
        </div>

        <div class="landing-section">
            <h2 class="section-headline">What it does</h2>
            <div class="capability-grid">
                <div class="capability">
                    <v-icon size="28" color="success">mdi-layers</v-icon>
                    <div class="capability-title">Multi-retailer overlays</div>
                    <p>
                        Choose retailers, choose overlays, click any polygon or store dot to get
                        live Elemental context. The lead retailer renders as a choropleth;
                        additional retailers render as pattern overlays so signals stay
                        independently decodable.
                    </p>
                </div>
                <div class="capability">
                    <v-icon size="28" color="success">mdi-map-marker-radius</v-icon>
                    <div class="capability-title">Per-store entity resolution</div>
                    <p>
                        Stores aren't just dots — they're click-targets that resolve to Elemental
                        NEIDs when coverage exists. Phase 0 hit-rate threshold gates how
                        aggressively we treat them as primary surfaces.
                    </p>
                </div>
                <div class="capability">
                    <v-icon size="28" color="success">mdi-flask-empty-outline</v-icon>
                    <div class="capability-title">Cross-retailer recipes</div>
                    <p>
                        Three canonical recipes ship in MVP: event density, openings minus closings,
                        and cross-retailer co-occurrence. Each serializes into the URL — share a
                        link, share the analysis.
                    </p>
                </div>
                <div class="capability">
                    <v-icon size="28" color="success">mdi-shield-search</v-icon>
                    <div class="capability-title">MCP provenance, always</div>
                    <p>
                        Every context panel surfaces which Elemental tools were called, how long
                        each took, and whether the result was cached. Latency budgets are enforced
                        and visible.
                    </p>
                </div>
            </div>
        </div>

        <div class="landing-section landing-quotes">
            <div class="quote">
                <span class="quote-mark">“</span>
                <span
                    >The dots themselves are clickable context targets — store-level incidents,
                    permits, openings, closures, local press.</span
                >
            </div>
        </div>
    </div>
</template>

<script setup lang="ts"></script>

<style scoped>
    .landing {
        height: 100%;
        overflow-y: auto;
        background: var(--lv-black);
    }

    .landing-hero {
        padding: 72px 24px 56px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .landing-hero-inner {
        max-width: 880px;
        margin: 0 auto;
    }

    .hero-eyebrow {
        font-family: var(--font-mono);
        font-size: 0.78rem;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: var(--lv-green);
        margin-bottom: 16px;
    }

    .hero-title {
        font-family: var(--font-headline);
        font-weight: 400;
        font-size: 2.6rem;
        line-height: 1.15;
        letter-spacing: -0.01em;
        color: var(--lv-white);
        margin-bottom: 16px;
    }

    .hero-subtitle {
        font-size: 1.05rem;
        line-height: 1.55;
        color: var(--lv-silver);
        max-width: 640px;
        margin-bottom: 28px;
    }

    .hero-actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        margin-bottom: 24px;
    }

    .cta-btn {
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .cta-btn-outline {
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--lv-white);
    }

    .hero-meta {
        font-family: var(--font-mono);
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        color: var(--lv-silver);
        opacity: 0.7;
    }

    .landing-section {
        padding: 56px 24px;
        max-width: 1080px;
        margin: 0 auto;
    }

    .section-headline {
        font-family: var(--font-headline);
        font-weight: 400;
        font-size: 1.5rem;
        letter-spacing: -0.005em;
        color: var(--lv-white);
        margin-bottom: 32px;
    }

    .capability-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 20px;
    }

    .capability {
        background: var(--lv-surface);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        padding: 20px;
    }

    .capability-title {
        font-family: var(--font-headline);
        font-weight: 500;
        font-size: 1.05rem;
        margin: 12px 0 6px;
        color: var(--lv-white);
    }

    .capability p {
        font-size: 0.88rem;
        line-height: 1.55;
        color: var(--lv-silver);
        margin: 0;
    }

    .landing-quotes {
        padding-bottom: 96px;
    }

    .quote {
        font-family: var(--font-headline);
        font-weight: 300;
        font-size: 1.4rem;
        line-height: 1.4;
        color: var(--lv-white);
        max-width: 760px;
        margin: 0 auto;
        position: relative;
        padding-left: 40px;
    }

    .quote-mark {
        position: absolute;
        left: 0;
        top: -16px;
        font-size: 4rem;
        color: var(--lv-green);
        line-height: 1;
        opacity: 0.6;
    }

    @media (max-width: 720px) {
        .hero-title {
            font-size: 1.9rem;
        }
    }
</style>
