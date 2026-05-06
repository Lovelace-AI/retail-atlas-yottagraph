<script setup lang="ts">
    definePageMeta({ layout: false });

    const { userName } = useUserState();
    const router = useRouter();
    if (userName.value) {
        router.replace('/');
    }

    const form = reactive({
        name: '',
        email: '',
        company: '',
        note: '',
    });
    const submitting = ref(false);
    const submitted = ref(false);
    const errorMsg = ref<string | null>(null);

    function isValidEmail(v: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
    }

    const canSubmit = computed(
        () => !submitting.value && form.name.trim().length > 1 && isValidEmail(form.email)
    );

    async function submit(): Promise<void> {
        if (!canSubmit.value) return;
        submitting.value = true;
        errorMsg.value = null;
        try {
            await $fetch('/api/atlas/access-request', {
                method: 'POST',
                body: {
                    name: form.name.trim(),
                    email: form.email.trim(),
                    company: form.company.trim(),
                    note: form.note.trim(),
                    source: 'welcome',
                },
            });
            submitted.value = true;
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Submit failed';
            errorMsg.value = msg;
        } finally {
            submitting.value = false;
        }
    }

    function login(): void {
        router.push('/login');
    }
</script>

<template>
    <div class="welcome-root">
        <header class="welcome-header">
            <img src="/LL-logo-full-wht.svg" alt="Lovelace" class="logo" />
            <v-btn variant="text" color="primary" @click="login">Sign in</v-btn>
        </header>

        <main class="welcome-main">
            <section class="hero">
                <h1 class="display">Retail Atlas</h1>
                <p class="lede">
                    A composable retail-store map. Layer 30 retailers' store footprints on a single
                    canvas, click any county for live news, events, and economic context, and
                    compose recipes — event density, opens vs closes, cross-retailer overlap — in
                    seconds.
                </p>
                <div class="hero-stats mono">
                    <div><b>30</b> retailers</div>
                    <div><b>148k</b> stores</div>
                    <div><b>3,601</b> admin areas</div>
                    <div><b>3</b> countries</div>
                </div>
            </section>

            <section class="features">
                <div class="feature">
                    <div class="feature-icon">
                        <v-icon icon="mdi-map-outline" size="large" color="primary" />
                    </div>
                    <h3>Layer the footprint</h3>
                    <p>
                        Every retailer's stores rendered together at county / LAD / CMA resolution,
                        with multi-retailer pattern overlays where chains overlap.
                    </p>
                </div>
                <div class="feature">
                    <div class="feature-icon">
                        <v-icon icon="mdi-graph-outline" size="large" color="primary" />
                    </div>
                    <h3>Click for context</h3>
                    <p>
                        One click pulls live area events, articles, economic concepts, and
                        per-retailer corporate events from the Lovelace knowledge graph.
                    </p>
                </div>
                <div class="feature">
                    <div class="feature-icon">
                        <v-icon icon="mdi-test-tube" size="large" color="primary" />
                    </div>
                    <h3>Compose recipes</h3>
                    <p>
                        Event density, opens − closes deltas, cross-retailer co-occurrence — each is
                        a per-area scoring function that drives the choropleth.
                    </p>
                </div>
            </section>

            <section class="access-card">
                <v-card class="pa-6 access-inner" elevation="0" rounded="lg">
                    <h2 class="mb-2">Request access</h2>
                    <p class="muted mb-4">
                        The Atlas is in invite-only beta. Drop your details and we'll get back to
                        you. Already have access?
                        <a href="#" class="link" @click.prevent="login">Sign in here.</a>
                    </p>

                    <div v-if="submitted" class="thanks">
                        <v-icon icon="mdi-check-circle" color="primary" size="x-large" />
                        <h3 class="mt-4 mb-2">Thanks — we got it.</h3>
                        <p class="muted">
                            We'll reach out at {{ form.email }} when your seat is ready.
                        </p>
                    </div>
                    <form v-else class="form" @submit.prevent="submit">
                        <v-text-field
                            v-model="form.name"
                            label="Your name"
                            density="comfortable"
                            required
                            class="full"
                        />
                        <v-text-field
                            v-model="form.email"
                            label="Work email"
                            type="email"
                            density="comfortable"
                            required
                            class="full"
                        />
                        <v-text-field
                            v-model="form.company"
                            label="Company (optional)"
                            density="comfortable"
                            class="full"
                        />
                        <v-textarea
                            v-model="form.note"
                            label="What would you use Atlas for? (optional)"
                            density="comfortable"
                            rows="3"
                            class="full"
                        />
                        <v-alert
                            v-if="errorMsg"
                            type="error"
                            density="compact"
                            variant="tonal"
                            class="full"
                        >
                            {{ errorMsg }}
                        </v-alert>
                        <v-btn
                            type="submit"
                            color="primary"
                            :disabled="!canSubmit"
                            :loading="submitting"
                            size="large"
                            class="full submit-btn"
                            block
                        >
                            Request access
                        </v-btn>
                    </form>
                </v-card>
            </section>
        </main>

        <footer class="welcome-footer mono muted">
            <span>Lovelace · Retail Atlas beta</span>
            <span
                ><a href="https://github.com/Lovelace-AI/retail-atlas-yottagraph" class="link"
                    >github</a
                ></span
            >
        </footer>
    </div>
</template>

<style scoped>
    .welcome-root {
        min-height: 100vh;
        background: var(--lv-black, #0a0a0a);
        color: var(--lv-white, #e5e5e5);
        display: flex;
        flex-direction: column;
    }

    .welcome-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.5rem 2rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .logo {
        height: 1.5rem;
        width: auto;
    }

    .welcome-main {
        flex: 1;
        max-width: 1080px;
        margin: 0 auto;
        padding: 4rem 2rem 6rem;
        display: flex;
        flex-direction: column;
        gap: 4rem;
    }

    .hero {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
        align-items: flex-start;
    }
    .display {
        font-family: var(--font-headline, 'Inter', sans-serif);
        font-size: clamp(2.5rem, 6vw, 4.25rem);
        line-height: 1.05;
        font-weight: 500;
        letter-spacing: -0.02em;
        margin: 0;
    }
    .lede {
        font-size: 1.15rem;
        line-height: 1.55;
        max-width: 56ch;
        color: rgba(229, 229, 229, 0.85);
        margin: 0;
    }
    .hero-stats {
        display: flex;
        gap: 2rem;
        flex-wrap: wrap;
        font-size: 0.95rem;
        margin-top: 0.5rem;
        color: rgba(229, 229, 229, 0.7);
    }
    .hero-stats b {
        color: var(--lv-green, #3fea00);
        font-weight: 600;
    }

    .features {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 1.5rem;
    }
    .feature {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 0.75rem;
        padding: 1.5rem;
    }
    .feature-icon {
        margin-bottom: 0.75rem;
    }
    .feature h3 {
        margin: 0 0 0.5rem;
        font-size: 1.1rem;
        font-weight: 500;
    }
    .feature p {
        margin: 0;
        color: rgba(229, 229, 229, 0.75);
        font-size: 0.95rem;
        line-height: 1.5;
    }

    .access-card {
        max-width: 540px;
        align-self: center;
        width: 100%;
    }
    .access-inner {
        background: rgba(255, 255, 255, 0.04) !important;
        border: 1px solid rgba(255, 255, 255, 0.08) !important;
    }
    .form {
        display: grid;
        gap: 0.75rem;
    }
    .full {
        width: 100%;
    }
    .submit-btn {
        font-family: var(--font-mono);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .thanks {
        text-align: center;
        padding: 1.5rem 0;
    }

    .welcome-footer {
        padding: 1.5rem 2rem;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        display: flex;
        justify-content: space-between;
        font-size: 0.8rem;
    }

    .link {
        color: var(--lv-green, #3fea00);
        text-decoration: none;
    }
    .link:hover {
        text-decoration: underline;
    }
    .muted {
        color: rgba(229, 229, 229, 0.6);
    }
    .mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
