import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

export type DbClient = NeonQueryFunction<false, false>;

let _db: DbClient | null = null;
let _tablesInitialized = false;

/**
 * True when DATABASE_URL is present.
 * Does not validate connectivity.
 */
export function isDbConfigured(): boolean {
    return Boolean(process.env.DATABASE_URL);
}

/**
 * Lazily initialize the Neon query client from DATABASE_URL.
 * Returns null when Neon isn't configured for this runtime.
 */
export function getDb(): DbClient | null {
    if (_db) return _db;
    const url = process.env.DATABASE_URL;
    if (!url) return null;
    _db = neon(url);
    return _db;
}

/**
 * R-015 Phase A schema bootstrap.
 *
 * Idempotent DDL for the first Neon-backed Atlas substrate:
 * - builds metadata
 * - retailer summaries
 * - area aggregates
 * - store-level locations
 */
export async function ensureAtlasTables(sql: DbClient): Promise<void> {
    await sql.query(`
      CREATE TABLE IF NOT EXISTS atlas_builds (
        build_id TEXT PRIMARY KEY,
        generated_at TIMESTAMPTZ NOT NULL,
        source_manifest JSONB NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await sql.query(`
      CREATE TABLE IF NOT EXISTS atlas_retailers (
        build_id TEXT NOT NULL REFERENCES atlas_builds(build_id) ON DELETE CASCADE,
        slug TEXT NOT NULL,
        name TEXT NOT NULL,
        country TEXT NOT NULL,
        schema_flavor TEXT NOT NULL,
        sector TEXT,
        color TEXT,
        store_count INTEGER NOT NULL DEFAULT 0,
        area_count INTEGER NOT NULL DEFAULT 0,
        org_neid TEXT,
        meta JSONB NOT NULL DEFAULT '{}'::jsonb,
        PRIMARY KEY (build_id, slug)
      )
    `);

    await sql.query(`
      CREATE TABLE IF NOT EXISTS atlas_areas (
        build_id TEXT NOT NULL REFERENCES atlas_builds(build_id) ON DELETE CASCADE,
        area_key TEXT NOT NULL,
        area_code TEXT NOT NULL,
        area_type TEXT NOT NULL,
        country TEXT NOT NULL,
        area_name TEXT,
        region TEXT,
        centroid_lat DOUBLE PRECISION,
        centroid_lng DOUBLE PRECISION,
        neid TEXT,
        total_stores INTEGER NOT NULL DEFAULT 0,
        store_counts_by_retailer JSONB NOT NULL,
        PRIMARY KEY (build_id, area_key)
      )
    `);

    await sql.query(`
      CREATE TABLE IF NOT EXISTS atlas_stores (
        build_id TEXT NOT NULL REFERENCES atlas_builds(build_id) ON DELETE CASCADE,
        retailer_slug TEXT NOT NULL,
        store_id TEXT NOT NULL,
        country TEXT NOT NULL,
        area_key TEXT NOT NULL,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        format TEXT,
        status TEXT,
        address TEXT,
        city TEXT,
        region TEXT,
        postal_code TEXT,
        neid TEXT,
        attrs JSONB NOT NULL DEFAULT '{}'::jsonb,
        PRIMARY KEY (build_id, retailer_slug, store_id)
      )
    `);

    await sql.query(`
      CREATE INDEX IF NOT EXISTS idx_atlas_stores_build_country_area
      ON atlas_stores(build_id, country, area_key)
    `);
    await sql.query(`
      CREATE INDEX IF NOT EXISTS idx_atlas_areas_build_country
      ON atlas_areas(build_id, country)
    `);
    await sql.query(`
      CREATE INDEX IF NOT EXISTS idx_atlas_areas_build_neid
      ON atlas_areas(build_id, neid)
    `);
}

/**
 * Runtime helper for API routes. Reuses process-level init guard.
 */
export async function ensureAtlasTablesOnce(): Promise<boolean> {
    if (_tablesInitialized) return true;
    const sql = getDb();
    if (!sql) return false;
    await ensureAtlasTables(sql);
    _tablesInitialized = true;
    return true;
}
