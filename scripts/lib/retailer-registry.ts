import type { RetailerMeta } from '../../types/retail';

/**
 * Canonical roster of retailers tracked by Retail Atlas.
 *
 * Adding a new retailer:
 *   1. Drop the enriched CSV into data/retail_locations/.
 *   2. Append an entry below with slug, display name, country, schema flavor,
 *      sector, and a brand-adjacent color. Hue should be 5–10 degrees off the
 *      exact brand hue (see DESIGN.md R11.2).
 *   3. Run `npm run build:data` and commit the regenerated outputs.
 *
 * Schema flavors:
 *   - us-fips: state_fips/county_fips/cbsa_fips/csa_fips columns
 *   - uk-lad:  itl1_code/lad_code/msoa_code/lsoa_code columns
 *   - ca-cma:  province_code/cma_code/cma_type/fsa columns
 */
export const RETAILERS: RetailerMeta[] = [
    {
        slug: 'walmart',
        name: 'Walmart',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(210, 90%, 55%)',
        csv: 'walmart_stores.csv',
        sector: 'big-box',
    },
    {
        slug: 'target',
        name: 'Target',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(0, 85%, 55%)',
        csv: 'target_stores.csv',
        sector: 'big-box',
    },
    {
        slug: 'costco',
        name: 'Costco',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(355, 90%, 50%)',
        csv: 'costco_stores.csv',
        sector: 'big-box',
    },
    {
        slug: 'kohls',
        name: "Kohl's",
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(355, 65%, 45%)',
        csv: 'kohls_stores.csv',
        sector: 'big-box',
    },
    {
        slug: 'home_depot',
        name: 'The Home Depot',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(20, 95%, 50%)',
        csv: 'home_depot_stores.csv',
        sector: 'home-improvement',
    },
    {
        slug: 'lowes',
        name: "Lowe's",
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(220, 85%, 45%)',
        csv: 'lowes_stores.csv',
        sector: 'home-improvement',
    },

    {
        slug: 'kroger',
        name: 'Kroger',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(220, 70%, 45%)',
        csv: 'kroger_stores.csv',
        sector: 'grocery',
    },
    {
        slug: 'albertsons',
        name: 'Albertsons',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(220, 55%, 50%)',
        csv: 'albertsons_stores.csv',
        sector: 'grocery',
    },
    {
        slug: 'publix',
        name: 'Publix',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(120, 50%, 40%)',
        csv: 'publix_stores.csv',
        sector: 'grocery',
    },
    {
        slug: 'aldi',
        name: 'Aldi',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(210, 85%, 50%)',
        csv: 'aldi_stores.csv',
        sector: 'grocery',
    },
    {
        slug: 'hy_vee',
        name: 'Hy-Vee',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(0, 80%, 45%)',
        csv: 'hy_vee_stores.csv',
        sector: 'grocery',
    },
    {
        slug: 'whole_foods',
        name: 'Whole Foods Market',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(110, 35%, 35%)',
        csv: 'whole_foods_stores.csv',
        sector: 'grocery',
    },
    {
        slug: 'trader_joes',
        name: "Trader Joe's",
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(355, 75%, 45%)',
        csv: 'trader_joes_stores.csv',
        sector: 'grocery',
    },

    {
        slug: 'dollargeneral',
        name: 'Dollar General',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(42, 95%, 55%)',
        csv: 'dollargeneral_stores.csv',
        sector: 'dollar',
    },
    {
        slug: 'dollar_tree',
        name: 'Dollar Tree',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(140, 60%, 45%)',
        csv: 'dollar_tree_stores.csv',
        sector: 'dollar',
    },
    {
        slug: 'family_dollar',
        name: 'Family Dollar',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(28, 80%, 50%)',
        csv: 'family_dollar_stores.csv',
        sector: 'dollar',
    },

    {
        slug: 'cvs',
        name: 'CVS',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(0, 80%, 50%)',
        csv: 'cvs_stores.csv',
        sector: 'drug',
    },
    {
        slug: 'walgreens',
        name: 'Walgreens',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(15, 75%, 45%)',
        csv: 'walgreens_stores.csv',
        sector: 'drug',
    },

    {
        slug: 'mcdonalds',
        name: "McDonald's",
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(45, 100%, 55%)',
        csv: 'mcdonalds_stores.csv',
        sector: 'qsr',
    },
    {
        slug: 'subway',
        name: 'Subway',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(115, 60%, 40%)',
        csv: 'subway_stores.csv',
        sector: 'qsr',
    },
    {
        slug: 'chick_fil_a',
        name: 'Chick-fil-A',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(348, 75%, 45%)',
        csv: 'chick_fil_a_stores.csv',
        sector: 'qsr',
    },
    {
        slug: 'chipotle',
        name: 'Chipotle',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(15, 75%, 35%)',
        csv: 'chipotle_stores.csv',
        sector: 'qsr',
    },

    {
        slug: 'starbucks',
        name: 'Starbucks',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(150, 50%, 30%)',
        csv: 'starbucks_stores.csv',
        sector: 'coffee',
    },
    {
        slug: 'dunkin_donuts',
        name: 'Dunkin',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(330, 80%, 55%)',
        csv: 'dunkin_donuts_stores.csv',
        sector: 'coffee',
    },

    {
        slug: 'planet_fitness',
        name: 'Planet Fitness',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(280, 75%, 55%)',
        csv: 'planet_fitness_stores.csv',
        sector: 'specialty',
    },
    {
        slug: 'lululemon',
        name: 'lululemon',
        country: 'US',
        schema: 'us-fips',
        color: 'hsl(0, 0%, 25%)',
        csv: 'lululemon_stores.csv',
        sector: 'specialty',
    },

    {
        slug: 'tesco',
        name: 'Tesco',
        country: 'UK',
        schema: 'uk-lad',
        color: 'hsl(220, 90%, 50%)',
        csv: 'tesco_stores.csv',
        sector: 'grocery',
    },
    {
        slug: 'booker',
        name: 'Booker',
        country: 'UK',
        schema: 'uk-lad',
        color: 'hsl(15, 80%, 50%)',
        csv: 'booker_stores.csv',
        sector: 'grocery',
    },
    {
        slug: 'onestop',
        name: 'One Stop',
        country: 'UK',
        schema: 'uk-lad',
        color: 'hsl(195, 85%, 45%)',
        csv: 'onestop_stores.csv',
        sector: 'grocery',
    },

    {
        slug: 'loblaw',
        name: 'Loblaw',
        country: 'CA',
        schema: 'ca-cma',
        color: 'hsl(155, 60%, 50%)',
        csv: 'loblaw_stores.csv',
        sector: 'grocery',
    },
];

const RETAILERS_BY_SLUG: Map<string, RetailerMeta> = new Map(RETAILERS.map((r) => [r.slug, r]));

export function getRetailer(slug: string): RetailerMeta | undefined {
    return RETAILERS_BY_SLUG.get(slug);
}
