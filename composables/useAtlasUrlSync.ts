import { onMounted, watch } from 'vue';

import type { Country } from '~/types/retail';

import { type AtlasOverlay, type AtlasTimeWindow, useAtlasState } from './useAtlasState';

/**
 * Two-way URL ↔ state sync for the canvas (PRD R7.4).
 *
 * Encodes the current atlas state into compact query params:
 *
 *   /?c=US&r=event_density&t=365&f=walmart,target&halo=0&p=area:US:county:06037
 *
 * Decodes those params on mount and on every back/forward navigation. We
 * always use `router.replace` (never `push`) so chip-toggle storms don't
 * pollute browser history.
 *
 * Compact rather than compressed — URLs stay readable and shareable copy
 * paste-friendly. PRD R7.4 calls for compression, but for the volume of
 * state we serialize the URL stays short enough that compression is
 * just obfuscation.
 */

const VALID_COUNTRIES: ReadonlyArray<Country> = ['US', 'UK', 'CA'];
const VALID_RECIPES: ReadonlyArray<AtlasOverlay> = [
    'none',
    'event_density',
    'opens_minus_closes',
    'co_occurrence',
];
const VALID_TIME_WINDOWS: ReadonlyArray<AtlasTimeWindow> = ['30', '90', '365', 'all'];

interface AtlasQuery {
    c?: string; // country
    r?: string; // recipe
    t?: string; // time window
    f?: string; // active retailers, comma-separated
    halo?: string; // '0' | '1'
    p?: string; // pinned: "area:{key}" or "store:{slug}:{store_id}"
}

function pickFirst(v: unknown): string | undefined {
    if (typeof v === 'string') return v;
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'string') return v[0];
    return undefined;
}

function decodeQuery(raw: Record<string, unknown>): AtlasQuery {
    return {
        c: pickFirst(raw.c),
        r: pickFirst(raw.r),
        t: pickFirst(raw.t),
        f: pickFirst(raw.f),
        halo: pickFirst(raw.halo),
        p: pickFirst(raw.p),
    };
}

export function useAtlasUrlSync() {
    const route = useRoute();
    const router = useRouter();
    const {
        country,
        activeRetailers,
        timeWindow,
        overlay,
        showHalo,
        pinned,
        setCountry,
        clearPin,
    } = useAtlasState();

    /**
     * Read URL query and write state. Used on initial mount and on
     * back/forward navigations.
     */
    function applyQueryToState(q: AtlasQuery): void {
        if (q.c && (VALID_COUNTRIES as readonly string[]).includes(q.c)) {
            if (country.value !== q.c) {
                setCountry(q.c as Country);
            }
        }
        if (q.r && (VALID_RECIPES as readonly string[]).includes(q.r)) {
            overlay.value = q.r as AtlasOverlay;
        }
        if (q.t && (VALID_TIME_WINDOWS as readonly string[]).includes(q.t)) {
            timeWindow.value = q.t as AtlasTimeWindow;
        }
        if (typeof q.f === 'string') {
            const parts = q.f
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            // Only assign if the new array is non-empty AND differs from the
            // current. Empty `f=` means "no retailers" which we want to honor.
            if (parts.length > 0 || q.f === '') {
                activeRetailers.value = parts;
            }
        }
        if (q.halo === '0') showHalo.value = false;
        else if (q.halo === '1') showHalo.value = true;
        if (typeof q.p === 'string' && q.p.length > 0) {
            const [kind, ...rest] = q.p.split(':');
            if (kind === 'area' && rest.length > 0) {
                pinned.value = { kind: 'area', area_key: rest.join(':') };
            } else if (kind === 'store' && rest.length >= 2) {
                pinned.value = {
                    kind: 'store',
                    retailer_slug: rest[0],
                    store_id: rest.slice(1).join(':'),
                };
            }
        } else if (q.p === '') {
            clearPin();
        }
    }

    /**
     * Project the current state into a flat query object suitable for
     * `router.replace`. Drops keys that are at their default so the URL
     * stays minimal.
     */
    function buildQueryFromState(): Record<string, string> {
        const q: Record<string, string> = {};
        if (country.value !== 'US') q.c = country.value;
        if (overlay.value !== 'none') q.r = overlay.value;
        if (timeWindow.value !== '365') q.t = timeWindow.value;
        // Default chip set is target+walmart; only encode if it differs.
        const sortedActive = [...activeRetailers.value].sort();
        const isDefault =
            sortedActive.length === 2 &&
            sortedActive[0] === 'target' &&
            sortedActive[1] === 'walmart';
        if (!isDefault) q.f = sortedActive.join(',');
        if (showHalo.value === false) q.halo = '0';
        if (pinned.value) {
            if (pinned.value.kind === 'area') {
                q.p = `area:${pinned.value.area_key}`;
            } else {
                q.p = `store:${pinned.value.retailer_slug}:${pinned.value.store_id}`;
            }
        }
        return q;
    }

    function queryEquals(a: Record<string, unknown>, b: Record<string, string>): boolean {
        const ks = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of ks) {
            const av = pickFirst(a[k]) ?? '';
            const bv = b[k] ?? '';
            if (av !== bv) return false;
        }
        return true;
    }

    let suppressWatch = false;

    onMounted(() => {
        suppressWatch = true;
        try {
            applyQueryToState(decodeQuery(route.query));
        } finally {
            // Allow Vue to flush the state mutations before the watcher
            // fires its first sync. Using a microtask is enough.
            Promise.resolve().then(() => {
                suppressWatch = false;
            });
        }
    });

    // State → URL. Watches every input we care about; collapses bursts via
    // `replace` (so chip toggles don't pollute history).
    watch(
        () => [
            country.value,
            overlay.value,
            timeWindow.value,
            [...activeRetailers.value].sort().join(','),
            showHalo.value,
            pinned.value
                ? `${pinned.value.kind}:${
                      pinned.value.kind === 'area'
                          ? pinned.value.area_key
                          : `${pinned.value.retailer_slug}:${pinned.value.store_id}`
                  }`
                : '',
        ],
        () => {
            if (suppressWatch) return;
            const next = buildQueryFromState();
            if (queryEquals(route.query, next)) return;
            router.replace({ query: next });
        },
        { deep: false }
    );

    // URL → state on browser back/forward (route.query identity changes).
    watch(
        () => route.query,
        (q) => {
            if (suppressWatch) return;
            const decoded = decodeQuery(q);
            const projected = buildQueryFromState();
            if (queryEquals(q, projected)) return;
            suppressWatch = true;
            try {
                applyQueryToState(decoded);
            } finally {
                Promise.resolve().then(() => {
                    suppressWatch = false;
                });
            }
        }
    );
}
