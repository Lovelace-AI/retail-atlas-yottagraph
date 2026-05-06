<template>
    <v-menu :close-on-content-click="false" location="bottom end" min-width="320">
        <template #activator="{ props }">
            <v-tooltip text="Save / restore views">
                <template #activator="{ props: tprops }">
                    <v-btn
                        v-bind="{ ...props, ...tprops }"
                        icon="mdi-bookmark-outline"
                        size="small"
                        variant="text"
                        aria-label="Saved views"
                    />
                </template>
            </v-tooltip>
        </template>

        <v-card variant="flat" class="saved-card">
            <div class="card-header">
                <div class="card-title">Saved views</div>
                <v-btn
                    size="small"
                    color="primary"
                    variant="flat"
                    prepend-icon="mdi-content-save"
                    @click="openSaveDialog"
                >
                    Save current view
                </v-btn>
            </div>

            <div v-if="!list.length" class="empty-state muted">
                No saved views yet.<br />
                Click <em>Save current view</em> above to bookmark the current recipe + retailers +
                window + pinned area.
            </div>

            <div v-else class="saved-list">
                <div v-for="r in list" :key="r.id" class="saved-row" @click="restore(r)">
                    <div class="row-main">
                        <div class="row-label">{{ r.label }}</div>
                        <div class="row-meta mono muted">
                            {{ summarizeQuery(r.query) }}
                        </div>
                        <div class="row-meta mono muted">
                            {{ formatTs(r.created_at) }}
                        </div>
                    </div>
                    <v-btn
                        icon="mdi-delete-outline"
                        size="x-small"
                        variant="text"
                        aria-label="Delete saved view"
                        @click.stop="confirmRemove(r.id)"
                    />
                </div>
            </div>
        </v-card>
    </v-menu>

    <v-dialog v-model="saveDialog" max-width="420">
        <v-card>
            <v-card-title class="dialog-title">Save current view</v-card-title>
            <v-card-text>
                <v-text-field
                    v-model="saveLabel"
                    label="Label"
                    autofocus
                    density="compact"
                    variant="outlined"
                    hide-details
                    @keyup.enter="confirmSave"
                />
                <div class="muted mono small mt-3">
                    Bookmarks the URL state — recipe, retailer chips, country, time window, halo
                    toggle, and pin.
                </div>
            </v-card-text>
            <v-card-actions>
                <v-spacer />
                <v-btn variant="text" @click="saveDialog = false">Cancel</v-btn>
                <v-btn color="primary" variant="flat" @click="confirmSave">Save</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script setup lang="ts">
    import { ref } from 'vue';

    import { useSavedRecipes, type SavedRecipe } from '~/composables/useSavedRecipes';

    const { list, save, remove } = useSavedRecipes();
    const router = useRouter();
    const route = useRoute();

    const saveDialog = ref(false);
    const saveLabel = ref('');

    function openSaveDialog() {
        saveLabel.value = defaultLabel();
        saveDialog.value = true;
    }

    function defaultLabel(): string {
        const q = route.query;
        const parts: string[] = [];
        if (typeof q.r === 'string' && q.r) parts.push(q.r.replace(/_/g, ' '));
        if (typeof q.f === 'string' && q.f) parts.push(q.f.split(',').slice(0, 2).join('+'));
        if (typeof q.c === 'string' && q.c) parts.push(q.c);
        return parts.length ? parts.join(' · ') : 'Atlas view';
    }

    function snapshotQuery(): Record<string, string> {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(route.query)) {
            if (typeof v === 'string' && v.length > 0) out[k] = v;
        }
        return out;
    }

    function confirmSave() {
        save(saveLabel.value, snapshotQuery());
        saveDialog.value = false;
        saveLabel.value = '';
    }

    function confirmRemove(id: string) {
        // Lightweight confirm — no separate dialog; the icon-only delete
        // affordance is small and reversible (a second save remakes it).
        remove(id);
    }

    function restore(r: SavedRecipe) {
        router.replace({ query: r.query });
    }

    function summarizeQuery(q: Record<string, string>): string {
        const parts: string[] = [];
        if (q.r) parts.push(q.r);
        if (q.f) parts.push(q.f);
        if (q.t) parts.push(`${q.t}`);
        if (q.c) parts.push(q.c);
        if (q.p) parts.push('pinned');
        return parts.join(' · ') || 'default';
    }

    function formatTs(iso: string): string {
        try {
            const d = new Date(iso);
            const date = d.toISOString().slice(0, 10);
            const time = d.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            });
            return `${date} ${time}`;
        } catch {
            return iso;
        }
    }
</script>

<style scoped>
    .saved-card {
        padding: 12px;
        background: rgba(20, 20, 20, 0.98);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 6px;
        max-height: 60vh;
        overflow-y: auto;
    }

    .card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
    }

    .card-title {
        font-family: var(--font-headline, sans-serif);
        font-size: 0.95rem;
    }

    .empty-state {
        font-size: 0.8rem;
        line-height: 1.5;
        padding: 16px 4px;
        text-align: center;
    }

    .saved-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .saved-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 4px;
        cursor: pointer;
        transition: background 150ms ease-out;
    }

    .saved-row:hover {
        background: rgba(255, 255, 255, 0.04);
    }

    .row-main {
        flex: 1;
        min-width: 0;
    }

    .row-label {
        font-size: 0.9rem;
        line-height: 1.3;
        margin-bottom: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .row-meta {
        font-size: 0.7rem;
    }

    .muted {
        color: rgba(255, 255, 255, 0.45);
    }

    .mono {
        font-family: var(--font-mono, ui-monospace, monospace);
    }

    .dialog-title {
        font-family: var(--font-headline, sans-serif);
        font-size: 1.1rem;
    }

    .small {
        font-size: 0.8rem;
    }

    em {
        color: rgba(255, 255, 255, 0.65);
        font-style: italic;
    }
</style>
