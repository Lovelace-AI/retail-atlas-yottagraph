#!/usr/bin/env tsx

/**
 * R-015 Phase A backfill.
 *
 * Loads the current JSON substrate into Neon tables:
 * - atlas_builds
 * - atlas_retailers
 * - atlas_areas
 * - atlas_stores
 *
 * Usage:
 *   npm run db:atlas:load
 *   BUILD_ID=my_build npm run db:atlas:load
 */

import 'dotenv/config';

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import type { AreaRecord, BuildManifest, RetailerSummary, StoreRecord } from '../types/retail';
import { buildAreaKey } from './lib/normalize';
import { ensureAtlasTables, getDb } from '../server/utils/neon';

const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'data', 'retail_atlas');
const STORES_DIR = join(OUT_DIR, 'stores');

function readJson<T>(path: string): T {
    if (!existsSync(path)) {
        throw new Error(`Missing required file: ${path}`);
    }
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

function deriveBuildId(manifest: BuildManifest): string {
    if (process.env.BUILD_ID?.trim()) return process.env.BUILD_ID.trim();
    const raw = JSON.stringify({
        generated_at: manifest.generated_at,
        retailer_count: manifest.retailer_count,
        store_count: manifest.store_count,
        area_count: manifest.area_count,
        retailers: manifest.retailers.map((r) => ({
            slug: r.slug,
            csv_sha256: r.csv_sha256,
            csv_bytes: r.csv_bytes,
        })),
    });
    const hash = createHash('sha256').update(raw).digest('hex').slice(0, 16);
    return `atlas_${hash}`;
}

function placeholders(rows: number, cols: number, startAt = 1): string {
    let i = startAt;
    const out: string[] = [];
    for (let r = 0; r < rows; r++) {
        const row: string[] = [];
        for (let c = 0; c < cols; c++) row.push(`$${i++}`);
        out.push(`(${row.join(',')})`);
    }
    return out.join(',');
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function main(): Promise<void> {
    const sql = getDb();
    if (!sql) {
        throw new Error('DATABASE_URL not configured. Cannot load Neon Atlas substrate.');
    }
    await ensureAtlasTables(sql);

    const manifest = readJson<BuildManifest>(join(OUT_DIR, 'manifest.json'));
    const retailers = readJson<RetailerSummary[]>(join(OUT_DIR, 'retailers.json'));
    const areas = readJson<AreaRecord[]>(join(OUT_DIR, 'areas.json'));

    const buildId = deriveBuildId(manifest);
    console.log(`Using build_id=${buildId}`);

    await sql.query(
        `
      INSERT INTO atlas_builds (build_id, generated_at, source_manifest, status)
      VALUES ($1, $2::timestamptz, $3::jsonb, 'active')
      ON CONFLICT (build_id) DO UPDATE
      SET generated_at = EXCLUDED.generated_at,
          source_manifest = EXCLUDED.source_manifest,
          status = 'active'
    `,
        [buildId, manifest.generated_at, JSON.stringify(manifest)]
    );
    await sql.query(
        `UPDATE atlas_builds SET status = 'retired' WHERE build_id <> $1 AND status = 'active'`,
        [buildId]
    );

    const manifestBySlug = new Map(manifest.retailers.map((r) => [r.slug, r]));
    const retailerChunks = chunk(retailers, 200);
    for (const ch of retailerChunks) {
        const params: unknown[] = [];
        for (const r of ch) {
            const man = manifestBySlug.get(r.slug);
            params.push(
                buildId,
                r.slug,
                r.name,
                r.country,
                r.schema,
                r.sector ?? null,
                r.color ?? null,
                r.store_count,
                r.area_count,
                r.org_neid ?? null,
                JSON.stringify({
                    format_distribution: r.format_distribution ?? {},
                    csv_sha256: man?.csv_sha256 ?? null,
                    csv_bytes: man?.csv_bytes ?? null,
                })
            );
        }
        await sql.query(
            `
        INSERT INTO atlas_retailers (
          build_id, slug, name, country, schema_flavor, sector, color,
          store_count, area_count, org_neid, meta
        ) VALUES ${placeholders(ch.length, 11)}
        ON CONFLICT (build_id, slug) DO UPDATE
        SET name = EXCLUDED.name,
            country = EXCLUDED.country,
            schema_flavor = EXCLUDED.schema_flavor,
            sector = EXCLUDED.sector,
            color = EXCLUDED.color,
            store_count = EXCLUDED.store_count,
            area_count = EXCLUDED.area_count,
            org_neid = EXCLUDED.org_neid,
            meta = EXCLUDED.meta
      `,
            params as any[]
        );
    }
    console.log(`Upserted retailers: ${retailers.length}`);

    const areaChunks = chunk(areas, 500);
    for (const ch of areaChunks) {
        const params: unknown[] = [];
        for (const a of ch) {
            params.push(
                buildId,
                a.area_key,
                a.area_code,
                a.area_type,
                a.country,
                a.area_name ?? null,
                a.region ?? null,
                a.centroid?.[1] ?? null,
                a.centroid?.[0] ?? null,
                a.neid ?? null,
                a.total_stores,
                JSON.stringify(a.store_counts_by_retailer ?? {})
            );
        }
        await sql.query(
            `
        INSERT INTO atlas_areas (
          build_id, area_key, area_code, area_type, country, area_name, region,
          centroid_lat, centroid_lng, neid, total_stores, store_counts_by_retailer
        ) VALUES ${placeholders(ch.length, 12)}
        ON CONFLICT (build_id, area_key) DO UPDATE
        SET area_code = EXCLUDED.area_code,
            area_type = EXCLUDED.area_type,
            country = EXCLUDED.country,
            area_name = EXCLUDED.area_name,
            region = EXCLUDED.region,
            centroid_lat = EXCLUDED.centroid_lat,
            centroid_lng = EXCLUDED.centroid_lng,
            neid = EXCLUDED.neid,
            total_stores = EXCLUDED.total_stores,
            store_counts_by_retailer = EXCLUDED.store_counts_by_retailer
      `,
            params as any[]
        );
    }
    console.log(`Upserted areas: ${areas.length}`);

    const storeFiles = readdirSync(STORES_DIR).filter((f) => f.endsWith('.json'));
    let totalStores = 0;
    for (const f of storeFiles) {
        const slug = f.replace(/\.json$/, '');
        const stores = readJson<StoreRecord[]>(join(STORES_DIR, f));
        totalStores += stores.length;
        for (const ch of chunk(stores, 500)) {
            const params: unknown[] = [];
            for (const s of ch) {
                const areaKey = buildAreaKey(s.country, s.area_type, s.area_code);
                params.push(
                    buildId,
                    slug,
                    s.store_id,
                    s.country,
                    areaKey,
                    s.lat ?? null,
                    s.lng ?? null,
                    s.format ?? null,
                    s.status ?? null,
                    s.address ?? null,
                    s.city ?? null,
                    s.region ?? null,
                    s.postal_code ?? null,
                    s.neid ?? null,
                    JSON.stringify({
                        banner: s.banner ?? null,
                        phone: s.phone ?? null,
                        url: s.url ?? null,
                        area_code: s.area_code,
                        area_type: s.area_type,
                        area_name: s.area_name ?? null,
                        state_fips: s.state_fips ?? null,
                        county_fips: s.county_fips ?? null,
                        cbsa_fips: s.cbsa_fips ?? null,
                        csa_fips: s.csa_fips ?? null,
                        lad_code: s.lad_code ?? null,
                        msoa_code: s.msoa_code ?? null,
                        lsoa_code: s.lsoa_code ?? null,
                        province_code: s.province_code ?? null,
                        cma_code: s.cma_code ?? null,
                        cma_type: s.cma_type ?? null,
                        fsa: s.fsa ?? null,
                    })
                );
            }
            await sql.query(
                `
          INSERT INTO atlas_stores (
            build_id, retailer_slug, store_id, country, area_key, lat, lng, format, status,
            address, city, region, postal_code, neid, attrs
          ) VALUES ${placeholders(ch.length, 15)}
          ON CONFLICT (build_id, retailer_slug, store_id) DO UPDATE
          SET country = EXCLUDED.country,
              area_key = EXCLUDED.area_key,
              lat = EXCLUDED.lat,
              lng = EXCLUDED.lng,
              format = EXCLUDED.format,
              status = EXCLUDED.status,
              address = EXCLUDED.address,
              city = EXCLUDED.city,
              region = EXCLUDED.region,
              postal_code = EXCLUDED.postal_code,
              neid = EXCLUDED.neid,
              attrs = EXCLUDED.attrs
        `,
                params as any[]
            );
        }
    }
    console.log(`Upserted stores: ${totalStores}`);
    console.log('Neon Atlas substrate load complete.');
}

void main().catch((err) => {
    console.error(err);
    process.exit(1);
});
