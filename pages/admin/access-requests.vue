<script setup lang="ts">
    interface AccessRequest {
        ts: string;
        email: string;
        name: string;
        company: string;
        note: string;
        source: string;
        ip: string | null;
    }

    interface ListResponse {
        enabled: boolean;
        count: number;
        items: AccessRequest[];
    }

    const data = ref<ListResponse | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);

    async function load(): Promise<void> {
        loading.value = true;
        error.value = null;
        try {
            data.value = await $fetch<ListResponse>('/api/atlas/access-request/list?limit=500');
        } catch (err) {
            error.value = err instanceof Error ? err.message : 'Load failed';
        } finally {
            loading.value = false;
        }
    }

    onMounted(load);

    function fmtDate(iso: string): string {
        try {
            return new Date(iso).toLocaleString();
        } catch {
            return iso;
        }
    }
</script>

<template>
    <v-container fluid class="pa-6">
        <div class="d-flex align-center mb-4">
            <h1 class="text-h5 me-4">Access requests</h1>
            <v-spacer />
            <v-btn variant="text" @click="load" :loading="loading" prepend-icon="mdi-refresh">
                Refresh
            </v-btn>
        </div>

        <v-alert v-if="error" type="error" variant="tonal" class="mb-4">{{ error }}</v-alert>

        <v-alert v-if="data && !data.enabled" type="info" variant="tonal" class="mb-4">
            KV is not configured (KV_REST_API_URL / KV_REST_API_TOKEN). Submissions are not being
            persisted.
        </v-alert>

        <v-card v-if="data" elevation="0">
            <v-table density="comfortable">
                <thead>
                    <tr>
                        <th>When</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Company</th>
                        <th>Note</th>
                        <th class="mono">IP</th>
                        <th class="mono">Source</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(it, i) in data.items" :key="i">
                        <td class="mono">{{ fmtDate(it.ts) }}</td>
                        <td>{{ it.name }}</td>
                        <td>
                            <a :href="`mailto:${it.email}`" class="link">{{ it.email }}</a>
                        </td>
                        <td>{{ it.company || '—' }}</td>
                        <td class="note-cell">{{ it.note || '—' }}</td>
                        <td class="mono muted">{{ it.ip || '—' }}</td>
                        <td class="mono muted">{{ it.source }}</td>
                    </tr>
                    <tr v-if="data.items.length === 0">
                        <td colspan="7" class="text-center muted py-6">No requests yet.</td>
                    </tr>
                </tbody>
            </v-table>
        </v-card>
    </v-container>
</template>

<style scoped>
    .mono {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 0.85rem;
    }
    .muted {
        color: rgba(229, 229, 229, 0.6);
    }
    .note-cell {
        max-width: 28rem;
        white-space: pre-wrap;
        word-wrap: break-word;
    }
    .link {
        color: var(--lv-green, #3fea00);
        text-decoration: none;
    }
</style>
