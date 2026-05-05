import type { AreaType, RetailerMeta, StoreRecord } from '../../types/retail';

type CsvRow = Record<string, string>;

function clean(v: string | undefined | null): string | null {
    if (v === undefined || v === null) return null;
    const trimmed = String(v).trim();
    return trimmed.length === 0 ? null : trimmed;
}

function parseFloatOrNull(v: string | undefined | null): number | null {
    const c = clean(v);
    if (c === null) return null;
    const n = Number(c);
    return Number.isFinite(n) ? n : null;
}

function makeStoreId(retailer: RetailerMeta, row: CsvRow): string {
    const num = clean(row.store_number) ?? clean(row.slug);
    const seed = num ?? `${row.address_line1 ?? ''}|${row.city ?? ''}`;
    const safe = seed
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    return `${retailer.slug}-${safe || 'unknown'}`;
}

function normalizeUS(row: CsvRow, retailer: RetailerMeta): StoreRecord {
    const county_fips = clean(row.county_fips);
    const state_fips = clean(row.state_fips);
    const cbsa_fips = clean(row.cbsa_fips);
    const csa_fips = clean(row.csa_fips);
    const area_code = county_fips ?? state_fips ?? '';

    return {
        store_id: makeStoreId(retailer, row),
        retailer: retailer.name,
        retailer_slug: retailer.slug,
        banner: null,
        format: clean(row.format),
        status: clean(row.status) ?? 'open',
        country: 'US',
        address: clean(row.address_line1),
        city: clean(row.city),
        region: clean(row.region) ?? clean(row.state),
        postal_code: clean(row.postal_code),
        lat: parseFloatOrNull(row.latitude),
        lng: parseFloatOrNull(row.longitude),
        area_code,
        area_type: 'county',
        area_name: clean(row.county_name) ?? clean(row.county),
        state_fips: state_fips ?? undefined,
        county_fips: county_fips ?? undefined,
        cbsa_fips: cbsa_fips ?? undefined,
        csa_fips: csa_fips ?? undefined,
        url: clean(row.url),
        phone: clean(row.main_voice_phone_number),
        neid: null,
    };
}

function normalizeUK(row: CsvRow, retailer: RetailerMeta): StoreRecord {
    const lad_code = clean(row.lad_code);
    const msoa_code = clean(row.msoa_code);
    const lsoa_code = clean(row.lsoa_code);

    return {
        store_id: makeStoreId(retailer, row),
        retailer: retailer.name,
        retailer_slug: retailer.slug,
        banner: clean(row.banner),
        format: clean(row.format),
        status: clean(row.status) ?? 'open',
        country: 'UK',
        address: clean(row.address_line1),
        city: clean(row.city),
        region: clean(row.region) ?? clean(row.itl1_name),
        postal_code: clean(row.postal_code),
        lat: parseFloatOrNull(row.latitude),
        lng: parseFloatOrNull(row.longitude),
        area_code: lad_code ?? '',
        area_type: 'lad',
        area_name: clean(row.lad_name),
        lad_code: lad_code ?? undefined,
        msoa_code: msoa_code ?? undefined,
        lsoa_code: lsoa_code ?? undefined,
        url: clean(row.url),
        phone: clean(row.main_voice_phone_number),
        neid: null,
    };
}

function normalizeCA(row: CsvRow, retailer: RetailerMeta): StoreRecord {
    const cma_code = clean(row.cma_code);

    return {
        store_id: makeStoreId(retailer, row),
        retailer: retailer.name,
        retailer_slug: retailer.slug,
        banner: clean(row.banner),
        format: clean(row.format),
        status: clean(row.status) ?? 'open',
        country: 'CA',
        address: clean(row.address_line1),
        city: clean(row.city),
        region: clean(row.region) ?? clean(row.province_name),
        postal_code: clean(row.postal_code),
        lat: parseFloatOrNull(row.latitude),
        lng: parseFloatOrNull(row.longitude),
        area_code: cma_code ?? '',
        area_type: 'cma',
        area_name: clean(row.cma_name),
        province_code: clean(row.province_code) ?? undefined,
        cma_code: cma_code ?? undefined,
        cma_type: clean(row.cma_type) ?? undefined,
        fsa: clean(row.fsa) ?? undefined,
        url: clean(row.url),
        phone: clean(row.main_voice_phone_number),
        neid: null,
    };
}

/**
 * Dispatch a CSV row to the appropriate normalizer based on the retailer's
 * declared schema flavor. Returns null when the row is missing the minimum
 * fields needed to render on the map (lat/lng or area_code).
 */
export function normalizeRow(row: CsvRow, retailer: RetailerMeta): StoreRecord | null {
    let store: StoreRecord;
    switch (retailer.schema) {
        case 'us-fips':
            store = normalizeUS(row, retailer);
            break;
        case 'uk-lad':
            store = normalizeUK(row, retailer);
            break;
        case 'ca-cma':
            store = normalizeCA(row, retailer);
            break;
    }

    if (store.lat === null || store.lng === null) return null;
    if (!store.area_code) return null;

    return store;
}

export function buildAreaKey(country: string, area_type: AreaType, area_code: string): string {
    return `${country}:${area_type}:${area_code}`;
}
