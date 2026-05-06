/**
 * Shared type definitions for the Retail Atlas data substrate.
 *
 * The build pipeline (scripts/build-retail-data.ts) emits JSON files that
 * conform to these shapes; the map canvas and context panels consume them
 * directly. Keep this file the single source of truth.
 */

export type Country = 'US' | 'UK' | 'CA';

export type AreaType = 'county' | 'lad' | 'cma' | 'province';

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
    /**
     * Optional Elemental NEID for the retailer's parent organization. Populated
     * by `npm run expand:retailers` (cache file `data/neid_cache/retailer_neids.json`),
     * then merged into the emitted `retailers.json` by `build-retail-data.ts`.
     * When set, the `/atlas` context panel surfaces per-retailer events from
     * `elemental_get_events(org_neid)`.
     */
    org_neid?: string | null;
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

/**
 * R7 — Analysis recipes. Each recipe produces a per-area score that drives
 * the choropleth fill instead of the default store-count score. The map
 * canvas + legend swap to a sequential or diverging color scale based on
 * `RecipeResult.scale`.
 */
export type RecipeKey = 'none' | 'event_density' | 'opens_minus_closes' | 'co_occurrence';

export interface RecipeAreaScore {
    area_key: string;
    score: number;
    /** Tooltip context — the count side of a ratio (events for R7.1, opens for R7.2). */
    numerator?: number;
    /** Tooltip context — the denominator side (store_count for R7.1, closes for R7.2). */
    denominator?: number;
}

export interface RecipeToolCall {
    tool: string;
    ms: number;
    ok: boolean;
}

export interface RecipeResult {
    recipe: RecipeKey;
    generated_at: string;
    scale: 'sequential' | 'diverging';
    domain: [number, number];
    /** Diverging only — the neutral midpoint. */
    midpoint?: number;
    scores: RecipeAreaScore[];
    /** True when the result is a top-K subset (e.g. event-density fan-out). */
    truncated?: boolean;
    /** Per-tool MCP fan-out timing (Step 2/3 only). */
    tool_calls?: RecipeToolCall[];
}
