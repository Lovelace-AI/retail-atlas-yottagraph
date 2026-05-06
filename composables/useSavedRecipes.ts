import { ref, watch } from 'vue';

import { Pref } from './usePrefsStore';
import { useUserState } from './useUserState';

/**
 * R-002 — saved recipes per user (PRD R7.4).
 *
 * Each saved recipe is a snapshot of the URL query params produced by
 * `useAtlasUrlSync`. Restoring is just a navigation to `/?...` with that
 * query — the existing URL→state hydration runs and the canvas, recipe,
 * filters, and pin all come back together.
 *
 * Storage: `Pref<SavedRecipe[]>` at
 *   /users/{userId}/apps/retail-atlas/saved-recipes
 * KV-backed via the existing prefs store; degrades to in-memory when KV
 * is unconfigured (the Pref base class no-ops the write but keeps the
 * reactive ref live for the page session).
 *
 * Phase-5 expansion: when multi-tenant lands the same shape graduates to
 * a Postgres `atlas_saved_recipes` table per PRD R1.2 — `id`, `label`,
 * `recipe (jsonb)`, `created_at`, `updated_at`.
 */

export interface SavedRecipe {
    id: string;
    label: string;
    query: Record<string, string>;
    created_at: string;
}

interface SavedRecipesDoc {
    recipes: SavedRecipe[];
}

const APP_SLUG = 'retail-atlas';

const _list = ref<SavedRecipe[]>([]);
const _loaded = ref(false);

let _pref: Pref<SavedRecipe[]> | null = null;

function makeId(): string {
    // Avoids importing `crypto.randomUUID` types under Nuxt and is good
    // enough for a short-lived per-user list.
    const t = Date.now().toString(36);
    const r = Math.random().toString(36).slice(2, 8);
    return `${t}-${r}`;
}

export function useSavedRecipes() {
    const { userId } = useUserState();

    /**
     * Initialize the underlying Pref once we have a userId. Safe to call
     * repeatedly — the first call wires the watcher and reads any stored
     * value; subsequent calls are no-ops.
     */
    async function ensureLoaded(): Promise<void> {
        if (_loaded.value) return;
        const uid = userId.value;
        if (!uid) return; // Will be re-tried by the watcher below.
        const docPath = `/users/${uid}/apps/${APP_SLUG}/saved-recipes`;
        _pref = new Pref<SavedRecipe[]>(docPath, 'recipes', []);
        await _pref.initialize();
        // Pref reflects the value into _pref.r; mirror to our exported ref
        // so the components see updates without binding to Pref directly.
        _list.value = (_pref.r.value as SavedRecipe[] | undefined) ?? [];
        watch(_pref.r, (v) => {
            _list.value = (v as SavedRecipe[] | undefined) ?? [];
        });
        _loaded.value = true;
    }

    // If the userId becomes available later (e.g. after auth resolves),
    // load on demand.
    watch(
        userId,
        () => {
            void ensureLoaded();
        },
        { immediate: true }
    );

    function persist(next: SavedRecipe[]): void {
        _list.value = next;
        // The Pref watcher fires on .r assignment; mirror back so KV write happens.
        if (_pref) _pref.r.value = next;
    }

    /**
     * Snapshot the current URL query as a new saved recipe. Returns the
     * saved record so callers can show a confirmation toast.
     */
    function save(label: string, query: Record<string, string>): SavedRecipe {
        const trimmed = label.trim() || 'Untitled view';
        const entry: SavedRecipe = {
            id: makeId(),
            label: trimmed,
            query,
            created_at: new Date().toISOString(),
        };
        persist([entry, ..._list.value]);
        return entry;
    }

    function remove(id: string): void {
        persist(_list.value.filter((r) => r.id !== id));
    }

    function rename(id: string, label: string): void {
        const trimmed = label.trim() || 'Untitled view';
        persist(_list.value.map((r) => (r.id === id ? { ...r, label: trimmed } : r)));
    }

    return {
        list: _list,
        loaded: _loaded,
        save,
        remove,
        rename,
        ensureLoaded,
    };
}

// Helper exported separately so callers don't need to import the type alone.
export function makeSavedRecipesDoc(list: SavedRecipe[]): SavedRecipesDoc {
    return { recipes: list };
}
