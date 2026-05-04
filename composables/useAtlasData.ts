import type { Ref } from 'vue';

export interface Retailer {
    slug: string;
    name: string;
    country: string;
    color: string;
    colorVar: string;
    format_default: string;
    store_count_total: number;
    neid: string | null;
}

export interface Area {
    area_code: string;
    area_type: 'county' | 'lad' | 'cma' | string;
    country: string;
    area_name: string;
    region: string;
    centroid: [number, number];
    neid: string | null;
    store_counts: Record<string, number>;
}

export interface Store {
    store_id: string;
    retailer: string;
    retailer_name: string;
    banner: string | null;
    format: string;
    country: string;
    area_code: string;
    area_type: string;
    area_name: string;
    region: string;
    lat: number;
    lng: number;
    address: string;
    city: string;
    store_number: number;
    neid: string | null;
}

export interface Recipe {
    recipe_id: string;
    label: string;
    blurb: string;
    overlay_kind: string;
    color_scale: string;
    default_time_window_months: number | null;
}

interface AtlasDataset {
    retailers: Ref<Retailer[]>;
    areas: Ref<Area[]>;
    stores: Ref<Store[]>;
    recipes: Ref<Recipe[]>;
    loading: Ref<boolean>;
    error: Ref<string | null>;
    load: () => Promise<void>;
}

const _retailers = ref<Retailer[]>([]);
const _areas = ref<Area[]>([]);
const _stores = ref<Store[]>([]);
const _recipes = ref<Recipe[]>([]);
const _loading = ref(false);
const _error = ref<string | null>(null);
let _loadPromise: Promise<void> | null = null;

export function useAtlasData(): AtlasDataset {
    async function load() {
        if (_retailers.value.length) return;
        if (_loadPromise) return _loadPromise;

        _loading.value = true;
        _error.value = null;

        _loadPromise = (async () => {
            try {
                const [retailers, areas, stores, recipes] = await Promise.all([
                    $fetch<{ retailers: Retailer[] }>('/data/retail-atlas/retailers.json'),
                    $fetch<{ areas: Area[] }>('/data/retail-atlas/areas.json'),
                    $fetch<{ stores: Store[] }>('/data/retail-atlas/stores.json'),
                    $fetch<{ recipes: Recipe[] }>('/data/retail-atlas/recipes.json'),
                ]);
                _retailers.value = retailers.retailers;
                _areas.value = areas.areas;
                _stores.value = stores.stores;
                _recipes.value = recipes.recipes;
            } catch (e: any) {
                _error.value = e?.message ?? 'Failed to load atlas data';
                console.error('[useAtlasData] load failed:', e);
            } finally {
                _loading.value = false;
                _loadPromise = null;
            }
        })();

        return _loadPromise;
    }

    return {
        retailers: _retailers,
        areas: _areas,
        stores: _stores,
        recipes: _recipes,
        loading: _loading,
        error: _error,
        load,
    };
}
