import { computed, ref } from 'vue';

import type { Country } from '~/types/retail';

/**
 * Shared reactive state for the /atlas canvas.
 *
 * Module-level refs intentionally — every consumer (control rail, map
 * canvas, context panel, legend) reads and writes the same values. The
 * URL query string is the secondary persistence surface (per PRD R7.4)
 * but URL syncing is wired one-way for now: state -> URL, on change.
 *
 * Defaults match PRD R3.2:
 *   country = 'US'
 *   activeRetailers = ['target', 'walmart']
 *   timeWindow = '365' (days)
 *   overlay = 'none'
 */

export type AtlasTimeWindow = '30' | '90' | '365' | 'all';
export type AtlasOverlay = 'none' | 'event_density' | 'opens_minus_closes' | 'co_occurrence';

export interface PinnedArea {
    kind: 'area';
    area_key: string;
}

export interface PinnedStore {
    kind: 'store';
    store_id: string;
    retailer_slug: string;
}

export type Pinned = PinnedArea | PinnedStore | null;

const _country = ref<Country>('US');
const _activeRetailers = ref<string[]>(['target', 'walmart']);
const _timeWindow = ref<AtlasTimeWindow>('365');
const _overlay = ref<AtlasOverlay>('none');
const _pinned = ref<Pinned>(null);
const _hoveredAreaKey = ref<string | null>(null);

export function useAtlasState() {
    return {
        country: _country,
        activeRetailers: _activeRetailers,
        timeWindow: _timeWindow,
        overlay: _overlay,
        pinned: _pinned,
        hoveredAreaKey: _hoveredAreaKey,

        /**
         * Toggle a retailer slug in/out of the active set.
         */
        toggleRetailer(slug: string): void {
            const idx = _activeRetailers.value.indexOf(slug);
            if (idx >= 0) {
                _activeRetailers.value = _activeRetailers.value.filter((_, i) => i !== idx);
            } else {
                _activeRetailers.value = [..._activeRetailers.value, slug];
            }
        },

        setCountry(c: Country): void {
            _country.value = c;
            _pinned.value = null;
        },

        clearPin(): void {
            _pinned.value = null;
        },

        pinArea(area_key: string): void {
            _pinned.value = { kind: 'area', area_key };
        },

        pinStore(store_id: string, retailer_slug: string): void {
            _pinned.value = { kind: 'store', store_id, retailer_slug };
        },

        isRetailerActive: (slug: string) => computed(() => _activeRetailers.value.includes(slug)),
    };
}
