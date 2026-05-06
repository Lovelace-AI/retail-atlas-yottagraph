<template>
    <div class="admin-page">
        <div class="page-header">
            <div class="page-title">
                <v-icon icon="mdi-chart-line" class="mr-2" />
                Telemetry
                <span class="muted mono">/atlas fan-out routes</span>
            </div>
            <div class="header-controls">
                <v-btn-toggle
                    v-model="hours"
                    density="compact"
                    variant="outlined"
                    color="primary"
                    mandatory
                    divided
                    @update:model-value="onHoursChange"
                >
                    <v-btn :value="1" size="small">1h</v-btn>
                    <v-btn :value="24" size="small">24h</v-btn>
                    <v-btn :value="24 * 7" size="small">7d</v-btn>
                    <v-btn :value="24 * 30" size="small">30d</v-btn>
                </v-btn-toggle>
                <v-btn
                    icon="mdi-refresh"
                    size="small"
                    variant="text"
                    :loading="loading"
                    aria-label="Refresh"
                    @click="refresh"
                />
            </div>
        </div>

        <div v-if="error" class="error-msg">
            <v-icon icon="mdi-alert" class="mr-2" />
            {{ error }}
        </div>

        <div v-if="data" class="kpi-row">
            <div class="kpi-card">
                <div class="kpi-label">Calls</div>
                <div class="kpi-value">{{ data.count.toLocaleString() }}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">Cache hit-rate</div>
                <div class="kpi-value">
                    {{ Math.round(data.cache_hit_rate * 100) }}<span class="kpi-unit">%</span>
                </div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">p50 latency</div>
                <div class="kpi-value">
                    {{ formatMs(data.p50_ms) }}
                </div>
            </div>
            <div class="kpi-card">
                <div class="kpi-label">p95 latency</div>
                <div class="kpi-value">
                    {{ formatMs(data.p95_ms) }}
                </div>
            </div>
        </div>

        <div v-if="data && Object.keys(data.by_endpoint).length" class="section">
            <div class="section-title">By endpoint</div>
            <v-table density="compact" theme="dark" class="data-table">
                <thead>
                    <tr>
                        <th>Endpoint</th>
                        <th class="num">Calls</th>
                        <th class="num">Cache hit</th>
                        <th class="num">p50</th>
                        <th class="num">p95</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(bucket, key) in data.by_endpoint" :key="key">
                        <td class="mono">{{ key }}</td>
                        <td class="num mono">{{ bucket.count.toLocaleString() }}</td>
                        <td class="num mono">{{ Math.round(bucket.cache_hit_rate * 100) }}%</td>
                        <td class="num mono">{{ formatMs(bucket.p50_ms) }}</td>
                        <td class="num mono">{{ formatMs(bucket.p95_ms) }}</td>
                    </tr>
                </tbody>
            </v-table>
        </div>

        <div v-if="data && data.top_retailers.length" class="section section-split">
            <div class="section-half">
                <div class="section-title">Top retailers (by mention count)</div>
                <v-table density="compact" theme="dark" class="data-table">
                    <thead>
                        <tr>
                            <th>Retailer</th>
                            <th class="num">Calls</th>
                            <th>Share</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="r in data.top_retailers" :key="r.slug">
                            <td class="mono">{{ r.slug }}</td>
                            <td class="num mono">{{ r.count.toLocaleString() }}</td>
                            <td class="bar-cell">
                                <div
                                    class="bar"
                                    :style="{ width: barPct(r.count, data.top_retailers[0].count) }"
                                />
                            </td>
                        </tr>
                    </tbody>
                </v-table>
            </div>

            <div v-if="Object.keys(data.by_country).length" class="section-half">
                <div class="section-title">By country</div>
                <v-table density="compact" theme="dark" class="data-table">
                    <thead>
                        <tr>
                            <th>Country</th>
                            <th class="num">Calls</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(v, k) in data.by_country" :key="k">
                            <td class="mono">{{ k }}</td>
                            <td class="num mono">{{ v.count.toLocaleString() }}</td>
                        </tr>
                    </tbody>
                </v-table>
            </div>
        </div>

        <div v-if="data && data.recent.length" class="section">
            <div class="section-title">Recent calls (latest first)</div>
            <v-table density="compact" theme="dark" class="data-table">
                <thead>
                    <tr>
                        <th>Time</th>
                        <th>Endpoint</th>
                        <th>Country</th>
                        <th>Window</th>
                        <th>Retailers</th>
                        <th class="num">Latency</th>
                        <th>Cache</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(rec, i) in data.recent" :key="i">
                        <td class="mono nowrap">{{ formatTs(rec.ts) }}</td>
                        <td class="mono">{{ rec.endpoint }}</td>
                        <td class="mono">{{ rec.request.country ?? '—' }}</td>
                        <td class="mono">{{ rec.request.time_window ?? '—' }}</td>
                        <td class="mono small">
                            {{ (rec.request.retailers ?? []).join(',') || '—' }}
                        </td>
                        <td class="num mono">{{ formatMs(rec.total_ms) }}</td>
                        <td class="mono">
                            <v-chip
                                :color="rec.cache_hit ? 'success' : 'default'"
                                size="x-small"
                                variant="tonal"
                            >
                                {{ rec.cache_hit ? 'hit' : 'miss' }}
                            </v-chip>
                        </td>
                    </tr>
                </tbody>
            </v-table>
        </div>

        <div v-if="data && data.count === 0" class="empty-state">
            <v-icon icon="mdi-database-off" size="large" class="mb-2" />
            <div>
                No telemetry recorded in the last {{ hours }} hour{{ hours === 1 ? '' : 's' }}.
            </div>
            <div class="muted">
                If KV is unconfigured (local dev with `KV_REST_API_URL` unset), `logToolCalls`
                no-ops. On Vercel with KV provisioned this populates within a request or two of any
                user clicking through the canvas.
            </div>
        </div>

        <div v-if="data" class="footer-meta mono muted">
            Window: last {{ data.window_hours }}h · generated {{ formatTs(data.generated_at) }}
        </div>
    </div>
</template>

<script setup lang="ts">
    import { onMounted, ref } from 'vue';

    import { useTelemetrySummary } from '~/composables/useTelemetrySummary';

    useHead({
        title: 'Retail Atlas — Telemetry',
        meta: [
            {
                name: 'robots',
                content: 'noindex',
            },
        ],
    });

    const hours = ref<number>(24);
    const { data, loading, error, load } = useTelemetrySummary();

    onMounted(() => {
        refresh();
    });

    function refresh() {
        load(hours.value);
    }

    function onHoursChange(v: unknown) {
        if (typeof v === 'number') {
            hours.value = v;
            refresh();
        }
    }

    function formatMs(ms: number | null | undefined): string {
        if (ms == null) return '—';
        if (ms < 1000) return `${Math.round(ms)}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    }

    function formatTs(iso: string): string {
        try {
            const d = new Date(iso);
            const time = d.toLocaleTimeString(undefined, { hour12: false });
            const date = d.toISOString().slice(5, 10);
            return `${date} ${time}`;
        } catch {
            return iso;
        }
    }

    function barPct(value: number, max: number): string {
        if (max <= 0) return '0%';
        return `${Math.max(2, Math.round((value / max) * 100))}%`;
    }
</script>

<style scoped>
    .admin-page {
        padding: 24px 32px 80px;
        max-width: 1200px;
        margin: 0 auto;
        height: 100%;
        overflow-y: auto;
    }

    .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 20px;
        gap: 16px;
        flex-wrap: wrap;
    }

    .page-title {
        font-family: var(--font-headline, sans-serif);
        font-size: 1.4rem;
        font-weight: 500;
        display: flex;
        align-items: center;
    }

    .header-controls {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .kpi-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 12px;
        margin-bottom: 24px;
    }

    .kpi-card {
        background: rgba(28, 28, 28, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        padding: 16px;
    }

    .kpi-label {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: rgba(255, 255, 255, 0.55);
        margin-bottom: 6px;
    }

    .kpi-value {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 2rem;
        font-weight: 500;
        color: var(--lv-green, #3fea00);
    }

    .kpi-unit {
        font-size: 0.6em;
        opacity: 0.55;
        margin-left: 2px;
    }

    .section {
        margin-bottom: 28px;
    }

    .section-split {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
    }

    .section-title {
        font-family: var(--font-headline, sans-serif);
        font-size: 1rem;
        margin-bottom: 8px;
    }

    .data-table {
        background: transparent !important;
    }

    .data-table :deep(thead th) {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: rgba(255, 255, 255, 0.55);
    }

    .num {
        text-align: right;
    }

    .nowrap {
        white-space: nowrap;
    }

    .small {
        font-size: 0.7rem;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .bar-cell {
        width: 50%;
        min-width: 80px;
    }

    .bar {
        height: 6px;
        background: var(--lv-green, #3fea00);
        opacity: 0.55;
        border-radius: 1px;
    }

    .empty-state {
        background: rgba(28, 28, 28, 0.7);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 8px;
        padding: 32px 24px;
        text-align: center;
        max-width: 560px;
        margin: 32px auto;
    }

    .empty-state .muted {
        color: rgba(255, 255, 255, 0.45);
        font-size: 0.875rem;
        margin-top: 8px;
        line-height: 1.45;
    }

    .error-msg {
        color: #ef4444;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.875rem;
        padding: 12px;
        background: rgba(239, 68, 68, 0.05);
        border: 1px solid rgba(239, 68, 68, 0.25);
        border-radius: 6px;
        margin-bottom: 16px;
    }

    .footer-meta {
        font-size: 0.7rem;
        margin-top: 16px;
    }

    .muted {
        color: rgba(255, 255, 255, 0.45);
    }

    .mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }
</style>
