/**
 * Shared type definitions for the Retail Atlas data substrate.
 *
 * The build pipeline (scripts/build-retail-data.ts) emits JSON files that
 * conform to these shapes; the map canvas and context panels consume them
 * directly. Keep this file the single source of truth.
 */

export type Country = 'US' | 'UK' | 'CA';

export type AreaType = 'county' | 'lad' | 'cma';

export type SchemaFlavor = 'us-fips' | 'uk-lad' | 'ca-cma';

/**
 * Atomic geocoded unit: one physical retail location.
 *
 * `area_code` is the FIPS county code (US), LAD code (UK), or CMA code (CA);
 * `area_type` discriminates which. `(country, area_type, area_code)` is the
 * composite key joining a store to its Area Record.
 *
 * `neid` is populated downstream by `expand-store-neids` once Elemental
 * resolves an entity for the location; null until then.
 */
export interface StoreRecord {
    store_id: string;
    retailer: string;
    retailer_slug: string;
    banner: string | null;
    format: string | null;
    status: string;

    country: Country;

    address: string | null;
    city: string | null;
    region: string | null;
    postal_code: string | null;

    lat: number | null;
    lng: number | null;

    area_code: string;
    area_type: AreaType;
    area_name: string | null;

    state_fips?: string;
    county_fips?: string;
    cbsa_fips?: string;
    csa_fips?: string;

    lad_code?: string;
    msoa_code?: string;
    lsoa_code?: string;

    province_code?: string;
    cma_code?: string;
    cma_type?: string;
    fsa?: string;

    url: string | null;
    phone: string | null;

    neid: string | null;
}

/**
 * Atomic polygon unit: one administrative area where any tracked retailer
 * operates. `store_counts_by_retailer[slug]` is the raw store count for that
 * retailer in this area; the sum drives the choropleth fill.
 *
 * `neid` is required for the area to be click-interactive. Populated by
 * `expand-area-neids` against the Elemental MCP; null until then.
 */
export interface AreaRecord {
    area_key: string;
    area_code: string;
    area_type: AreaType;
    country: Country;
    area_name: string | null;
    region: string | null;

    centroid: [number, number] | null;

    store_counts_by_retailer: Record<string, number>;
    total_stores: number;

    neid: string | null;
}

export interface RetailerMeta {
    slug: string;
    name: string;
    country: Country;
    schema: SchemaFlavor;
    color: string;
    csv: string;
    sector: RetailerSector;
}

export type RetailerSector =
    | 'big-box'
    | 'grocery'
    | 'dollar'
    | 'drug'
    | 'qsr'
    | 'coffee'
    | 'specialty'
    | 'home-improvement';

export interface RetailerSummary extends RetailerMeta {
    store_count: number;
    area_count: number;
    format_distribution: Record<string, number>;
}

export interface BuildManifest {
    generated_at: string;
    source_dir: string;
    retailer_count: number;
    store_count: number;
    area_count: number;
    retailers: Array<{
        slug: string;
        store_count: number;
        csv_bytes: number;
        csv_sha256: string;
    }>;
}
