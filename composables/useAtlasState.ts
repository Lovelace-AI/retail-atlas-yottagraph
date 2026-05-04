/**
 * Shared canvas state for /atlas — the active country, retailer chips, time
 * window, overlay recipe, and currently-pinned area or store. State mirrors
 * the URL query string so links are shareable (per R7.4).
 */

export type CountryCode = 'US' | 'UK' | 'CA';
export type TimeWindow = '30d' | '90d' | '365d' | 'all';
export type Density = 'comfortable' | 'compact';

interface AtlasStateShape {
    country: CountryCode;
    retailers: Set<string>;
    overlay: string | null;
    timeWindow: TimeWindow;
    pinnedAreaCode: string | null;
    pinnedStoreId: string | null;
    sidebarCollapsed: boolean;
    density: Density;
}

const DEFAULTS_BY_COUNTRY: Record<CountryCode, string[]> = {
    US: ['target', 'walmart'],
    UK: ['tesco'],
    CA: ['loblaw'],
};

const _state = reactive<AtlasStateShape>({
    country: 'US',
    retailers: new Set(DEFAULTS_BY_COUNTRY.US),
    overlay: null,
    timeWindow: '365d',
    pinnedAreaCode: null,
    pinnedStoreId: null,
    sidebarCollapsed: false,
    density: 'compact',
});

export function useAtlasState() {
    function setCountry(country: CountryCode, opts: { resetRetailers?: boolean } = {}) {
        _state.country = country;
        if (opts.resetRetailers ?? true) {
            _state.retailers = new Set(DEFAULTS_BY_COUNTRY[country]);
        }
        _state.pinnedAreaCode = null;
        _state.pinnedStoreId = null;
    }

    function toggleRetailer(slug: string) {
        const next = new Set(_state.retailers);
        if (next.has(slug)) next.delete(slug);
        else next.add(slug);
        _state.retailers = next;
    }

    function isRetailerActive(slug: string) {
        return _state.retailers.has(slug);
    }

    function setOverlay(recipeId: string | null) {
        _state.overlay = recipeId;
    }

    function setTimeWindow(w: TimeWindow) {
        _state.timeWindow = w;
    }

    function pinArea(code: string | null) {
        _state.pinnedAreaCode = code;
        _state.pinnedStoreId = null;
    }

    function pinStore(id: string | null) {
        _state.pinnedStoreId = id;
        _state.pinnedAreaCode = null;
    }

    function clearPin() {
        _state.pinnedAreaCode = null;
        _state.pinnedStoreId = null;
    }

    function toggleSidebar() {
        _state.sidebarCollapsed = !_state.sidebarCollapsed;
    }

    function setDensity(d: Density) {
        _state.density = d;
    }

    function activeRetailerList(): string[] {
        return Array.from(_state.retailers);
    }

    return {
        state: _state,
        setCountry,
        toggleRetailer,
        isRetailerActive,
        setOverlay,
        setTimeWindow,
        pinArea,
        pinStore,
        clearPin,
        toggleSidebar,
        setDensity,
        activeRetailerList,
    };
}
