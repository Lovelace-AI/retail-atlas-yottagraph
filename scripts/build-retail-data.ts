#!/usr/bin/env tsx
/**
 * Retail Atlas data build pipeline.
 *
 * Reads the per-retailer CSVs in data/retail_locations/, normalizes the three
 * schema flavors (US FIPS / UK LAD / CA CMA) into a unified Store Record,
 * aggregates Area Records with cross-retailer store counts, and emits the
 * JSON files the Atlas map canvas consumes from public/data/retail_atlas/.
 *
 * Outputs:
 *   public/data/retail_atlas/
 *     manifest.json              Generation metadata + source CSV checksums
 *     retailers.json             Index of retailers (slug, name, country, color, counts)
 *     areas.json                 All Area Records, keyed by `country:type:code`
 *     stores/{slug}.json         Normalized Store[] per retailer
 *
 * Re-run anytime a CSV changes:
 *     npm run build:data
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
/* eslint-disable @typescript-eslint/no-unused-vars */

import { parse } from 'csv-parse/sync';

import type { AreaRecord, BuildManifest, RetailerSummary, StoreRecord } from '../types/retail';
import { buildAreaKey, normalizeRow } from './lib/normalize';
import { RETAILERS } from './lib/retailer-registry';

const ROOT = join(__dirname, '..');
const SOURCE_DIR = join(ROOT, 'data', 'retail_locations');
const OUT_DIR = join(ROOT, 'public', 'data', 'retail_atlas');
const STORES_DIR = join(OUT_DIR, 'stores');
const AREA_NEIDS_CACHE = join(ROOT, 'data', 'neid_cache', 'area_neids.json');
const RETAILER_NEIDS_CACHE = join(ROOT, 'data', 'neid_cache', 'retailer_neids.json');

interface AreaNeidCacheEntry {
    neid: string | null;
    name: string | null;
    score: number | null;
    flavor: string | null;
    matched_candidate: string | null;
    resolved_at: string;
}

interface RetailerNeidCacheEntry {
    neid: string | null;
    name: string | null;
    score: number | null;
    matched_query: string | null;
    resolved_at: string;
}

function loadAreaNeidCache(): Record<string, AreaNeidCacheEntry> {
    if (!existsSync(AREA_NEIDS_CACHE)) return {};
    try {
        return JSON.parse(readFileSync(AREA_NEIDS_CACHE, 'utf-8'));
    } catch (err) {
        console.warn(`  warning: could not read area NEID cache: ${(err as Error).message}`);
        return {};
    }
}

function loadRetailerNeidCache(): Record<string, RetailerNeidCacheEntry> {
    if (!existsSync(RETAILER_NEIDS_CACHE)) return {};
    try {
        return JSON.parse(readFileSync(RETAILER_NEIDS_CACHE, 'utf-8'));
    } catch (err) {
        console.warn(`  warning: could not read retailer NEID cache: ${(err as Error).message}`);
        return {};
    }
}

function ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
}

function writeJSON(path: string, data: unknown): number {
    const text = JSON.stringify(data);
    writeFileSync(path, text);
    return Buffer.byteLength(text, 'utf8');
}

function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

interface RetailerBuildResult {
    summary: RetailerSummary;
    stores: StoreRecord[];
    csv_bytes: number;
    csv_sha256: string;
}

function buildRetailer(slug: string): RetailerBuildResult {
    const meta = RETAILERS.find((r) => r.slug === slug);
    if (!meta) throw new Error(`Unknown retailer slug: ${slug}`);

    const csvPath = join(SOURCE_DIR, meta.csv);
    if (!existsSync(csvPath)) {
        throw new Error(`Missing CSV for ${slug}: ${csvPath}`);
    }

    const buf = readFileSync(csvPath);
    const rows: Record<string, string>[] = parse(buf, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        bom: true,
    });

    const stores: StoreRecord[] = [];
    const formatDist: Record<string, number> = {};
    const areaSet = new Set<string>();
    let dropped = 0;

    for (const row of rows) {
        const store = normalizeRow(row, meta);
        if (!store) {
            dropped += 1;
            continue;
        }
        stores.push(store);
        const fmt = store.format ?? 'unknown';
        formatDist[fmt] = (formatDist[fmt] ?? 0) + 1;
        areaSet.add(buildAreaKey(store.country, store.area_type, store.area_code));
    }

    if (dropped > 0) {
        console.warn(
            `  ${slug}: dropped ${dropped}/${rows.length} rows (missing lat/lng or area_code)`
        );
    }

    return {
        summary: {
            ...meta,
            store_count: stores.length,
            area_count: areaSet.size,
            format_distribution: formatDist,
        },
        stores,
        csv_bytes: buf.length,
        csv_sha256: sha256(buf),
    };
}

interface AreaAggregator {
    record: AreaRecord;
    lat_sum: number;
    lng_sum: number;
    coord_count: number;
}

function aggregateAreas(allStores: StoreRecord[]): AreaRecord[] {
    const byKey = new Map<string, AreaAggregator>();

    for (const store of allStores) {
        const key = buildAreaKey(store.country, store.area_type, store.area_code);
        let agg = byKey.get(key);
        if (!agg) {
            agg = {
                record: {
                    area_key: key,
                    area_code: store.area_code,
                    area_type: store.area_type,
                    country: store.country,
                    area_name: store.area_name,
                    region: store.region,
                    centroid: null,
                    store_counts_by_retailer: {},
                    total_stores: 0,
                    neid: null,
                },
                lat_sum: 0,
                lng_sum: 0,
                coord_count: 0,
            };
            byKey.set(key, agg);
        }

        agg.record.store_counts_by_retailer[store.retailer_slug] =
            (agg.record.store_counts_by_retailer[store.retailer_slug] ?? 0) + 1;
        agg.record.total_stores += 1;

        if (!agg.record.area_name && store.area_name) {
            agg.record.area_name = store.area_name;
        }
        if (!agg.record.region && store.region) {
            agg.record.region = store.region;
        }

        if (store.lat !== null && store.lng !== null) {
            agg.lat_sum += store.lat;
            agg.lng_sum += store.lng;
            agg.coord_count += 1;
        }
    }

    const records: AreaRecord[] = [];
    for (const { record, lat_sum, lng_sum, coord_count } of byKey.values()) {
        if (coord_count > 0) {
            record.centroid = [lng_sum / coord_count, lat_sum / coord_count];
        }
        records.push(record);
    }

    records.sort((a, b) => (a.area_key < b.area_key ? -1 : a.area_key > b.area_key ? 1 : 0));
    return records;
}

function main(): void {
    if (!existsSync(SOURCE_DIR)) {
        throw new Error(`Source directory not found: ${SOURCE_DIR}`);
    }
    ensureDir(OUT_DIR);
    ensureDir(STORES_DIR);

    console.log(`Building Retail Atlas data from ${relative(ROOT, SOURCE_DIR)}/`);
    console.log(`  ${RETAILERS.length} retailers in registry`);

    const summaries: RetailerSummary[] = [];
    const allStores: StoreRecord[] = [];
    const manifestRetailers: BuildManifest['retailers'] = [];

    for (const meta of RETAILERS) {
        const result = buildRetailer(meta.slug);
        summaries.push(result.summary);
        allStores.push(...result.stores);

        const outPath = join(STORES_DIR, `${meta.slug}.json`);
        const bytes = writeJSON(outPath, result.stores);

        manifestRetailers.push({
            slug: meta.slug,
            store_count: result.stores.length,
            csv_bytes: result.csv_bytes,
            csv_sha256: result.csv_sha256,
        });

        console.log(
            `  ${meta.slug.padEnd(18)} ${String(result.stores.length).padStart(6)} stores  →  ${fmtBytes(bytes)}`
        );
    }

    const areas = aggregateAreas(allStores);

    // Merge in pre-resolved area NEIDs from the cache emitted by
    // `npm run expand:areas`. Areas without an entry in the cache stay
    // `neid: null` and the runtime UI degrades gracefully.
    const neidCache = loadAreaNeidCache();
    let neidsApplied = 0;
    for (const a of areas) {
        const entry = neidCache[a.area_key];
        if (entry?.neid) {
            a.neid = entry.neid;
            neidsApplied += 1;
        }
    }
    if (Object.keys(neidCache).length > 0) {
        console.log(
            `  merged area NEIDs: ${neidsApplied}/${areas.length} from cache (${Object.keys(neidCache).length} entries)`
        );
    }

    // Merge in retailer org NEIDs from `npm run expand:retailers`. Each
    // RetailerSummary in retailers.json carries `org_neid` so the client
    // and the area-context endpoint can both resolve it without a separate
    // cache lookup.
    const retailerCache = loadRetailerNeidCache();
    let retailerNeidsApplied = 0;
    for (const s of summaries) {
        const entry = retailerCache[s.slug];
        if (entry?.neid) {
            s.org_neid = entry.neid;
            retailerNeidsApplied += 1;
        }
    }
    if (Object.keys(retailerCache).length > 0) {
        console.log(
            `  merged retailer NEIDs: ${retailerNeidsApplied}/${summaries.length} from cache`
        );
    }

    const retailersBytes = writeJSON(join(OUT_DIR, 'retailers.json'), summaries);
    const areasBytes = writeJSON(join(OUT_DIR, 'areas.json'), areas);

    const manifest: BuildManifest = {
        generated_at: new Date().toISOString(),
        source_dir: relative(ROOT, SOURCE_DIR),
        retailer_count: summaries.length,
        store_count: allStores.length,
        area_count: areas.length,
        retailers: manifestRetailers,
    };
    writeJSON(join(OUT_DIR, 'manifest.json'), manifest);

    const totalBytes =
        retailersBytes +
        areasBytes +
        manifestRetailers.reduce((sum, r) => {
            const p = join(STORES_DIR, `${r.slug}.json`);
            return sum + (existsSync(p) ? statSync(p).size : 0);
        }, 0);

    console.log('');
    console.log(`  retailers.json       →  ${fmtBytes(retailersBytes)}`);
    console.log(`  areas.json           →  ${fmtBytes(areasBytes)}  (${areas.length} areas)`);
    console.log('');
    console.log(
        `Done. ${allStores.length} stores across ${areas.length} areas, ${fmtBytes(totalBytes)} total.`
    );
    console.log(`Output: ${relative(ROOT, OUT_DIR)}/`);
}

main();
