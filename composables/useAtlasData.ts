import { computed, ref, shallowRef } from 'vue';

import type { AreaRecord, Country, RetailerSummary, StoreRecord } from '~/types/retail';

/**
 * Lazy data loaders for the /atlas canvas.
 *
 * The build pipeline (scripts/build-retail-data.ts) emits these JSON files
 * into public/data/retail_atlas/. We fetch them on demand and cache the
 * result module-level so subsequent calls are O(1).
 *
 * - retailers.json — full 30-retailer index (small; load on first read)
 * - areas.json — Area Records aggregated across all retailers (~1.2 MB)
 * - stores/{slug}.json — Store Records per retailer (lazy per chip toggle)
 * - topojson/{country}/* — boundary geometry (lazy per country switch)
 */

const RETAIL_BASE = '/data/retail_atlas';
const TOPO_BASE = '/data/topojson';

interface TopoJsonTopology {
    type: 'Topology';
    objects: Record<string, unknown>;
    arcs: unknown[];
    bbox?: number[];
    transform?: unknown;
}

const _retailers = shallowRef<RetailerSummary[] | null>(null);
const _retailersLoading = ref(false);

const _areas = shallowRef<AreaRecord[] | null>(null);
const _areasLoading = ref(false);

const _stores = shallowRef<Record<string, StoreRecord[]>>({});
const _storesLoading = shallowRef<Record<string, boolean>>({});

const _topology = shallowRef<Record<string, TopoJsonTopology>>({});
const _topologyLoading = shallowRef<Record<string, boolean>>({});

async function fetchJSON<T>(path: string): Promise<T> {
    const res = await fetch(path);
    if (!res.ok) {
        throw new Error(`Failed to load ${path}: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
}

export function useAtlasData() {
    async function loadRetailers(): Promise<RetailerSummary[]> {
        if (_retailers.value) return _retailers.value;
        if (_retailersLoading.value) {
            // Wait for in-flight load.
            await new Promise<void>((resolve) => {
                const check = () => {
                    if (!_retailersLoading.value) resolve();
                    else setTimeout(check, 25);
                };
                check();
            });
            return _retailers.value ?? [];
        }
        _retailersLoading.value = true;
        try {
            const data = await fetchJSON<RetailerSummary[]>(`${RETAIL_BASE}/retailers.json`);
            _retailers.value = data;
            return data;
        } finally {
            _retailersLoading.value = false;
        }
    }

    async function loadAreas(): Promise<AreaRecord[]> {
        if (_areas.value) return _areas.value;
        if (_areasLoading.value) {
            await new Promise<void>((resolve) => {
                const check = () => {
                    if (!_areasLoading.value) resolve();
                    else setTimeout(check, 25);
                };
                check();
            });
            return _areas.value ?? [];
        }
        _areasLoading.value = true;
        try {
            const data = await fetchJSON<AreaRecord[]>(`${RETAIL_BASE}/areas.json`);
            _areas.value = data;
            return data;
        } finally {
            _areasLoading.value = false;
        }
    }

    async function loadStores(slug: string): Promise<StoreRecord[]> {
        if (_stores.value[slug]) return _stores.value[slug];
        if (_storesLoading.value[slug]) {
            await new Promise<void>((resolve) => {
                const check = () => {
                    if (!_storesLoading.value[slug]) resolve();
                    else setTimeout(check, 25);
                };
                check();
            });
            return _stores.value[slug] ?? [];
        }
        _storesLoading.value = { ..._storesLoading.value, [slug]: true };
        try {
            const data = await fetchJSON<StoreRecord[]>(`${RETAIL_BASE}/stores/${slug}.json`);
            _stores.value = { ..._stores.value, [slug]: data };
            return data;
        } finally {
            _storesLoading.value = { ..._storesLoading.value, [slug]: false };
        }
    }

    async function loadTopology(country: Country): Promise<TopoJsonTopology> {
        const path = topologyPath(country);
        if (_topology.value[path]) return _topology.value[path];
        if (_topologyLoading.value[path]) {
            await new Promise<void>((resolve) => {
                const check = () => {
                    if (!_topologyLoading.value[path]) resolve();
                    else setTimeout(check, 25);
                };
                check();
            });
            return _topology.value[path];
        }
        _topologyLoading.value = { ..._topologyLoading.value, [path]: true };
        try {
            const data = await fetchJSON<TopoJsonTopology>(path);
            _topology.value = { ..._topology.value, [path]: data };
            return data;
        } finally {
            _topologyLoading.value = { ..._topologyLoading.value, [path]: false };
        }
    }

    function topologyPath(country: Country): string {
        switch (country) {
            case 'US':
                return `${TOPO_BASE}/us/counties-10m.json`;
            case 'UK':
                return `${TOPO_BASE}/uk/lads.topojson.json`;
            case 'CA':
                return `${TOPO_BASE}/ca/cmas.topojson.json`;
        }
    }

    function topologyObjectKey(country: Country): string {
        switch (country) {
            case 'US':
                return 'counties';
            case 'UK':
                return 'lads';
            case 'CA':
                return 'cmas';
        }
    }

    return {
        loadRetailers,
        loadAreas,
        loadStores,
        loadTopology,
        topologyObjectKey,

        retailers: computed(() => _retailers.value),
        areas: computed(() => _areas.value),
        stores: computed(() => _stores.value),

        retailersLoading: computed(() => _retailersLoading.value),
        areasLoading: computed(() => _areasLoading.value),
        storesLoadingFor: (slug: string) => computed(() => _storesLoading.value[slug] === true),
    };
}
