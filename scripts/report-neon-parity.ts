#!/usr/bin/env tsx

/**
 * R-015 Phase A parity report.
 *
 * Compares Neon counts for a build_id against current JSON substrate counts.
 *
 * Usage:
 *   npm run db:atlas:parity
 *   BUILD_ID=atlas_xxx npm run db:atlas:parity
 *   STRICT=1 npm run db:atlas:parity
 */

import 'dotenv/config';

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { AreaRecord, BuildManifest, RetailerSummary } from '../types/retail';
import { getDb } from '../server/utils/neon';

const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'data', 'retail_atlas');

function readJson<T>(path: string): T {
    if (!existsSync(path)) throw new Error(`Missing required file: ${path}`);
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

interface CountryRow {
    country: string;
    count: number;
}

async function groupedCounts(
    table: 'atlas_retailers' | 'atlas_areas' | 'atlas_stores',
    buildId: string
): Promise<Record<string, number>> {
    const sql = getDb();
    if (!sql) return {};
    const rows = (await sql.query(
        `SELECT country, COUNT(*)::int AS count FROM ${table} WHERE build_id = $1 GROUP BY country ORDER BY country`,
        [buildId]
    )) as CountryRow[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.country] = Number(r.count);
    return out;
}

function sumByCountry(retailers: RetailerSummary[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of retailers) out[r.country] = (out[r.country] ?? 0) + r.store_count;
    return out;
}

function countAreasByCountry(areas: AreaRecord[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const a of areas) out[a.country] = (out[a.country] ?? 0) + 1;
    return out;
}

function countRetailersByCountry(retailers: RetailerSummary[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const r of retailers) out[r.country] = (out[r.country] ?? 0) + 1;
    return out;
}

function compareMap(
    label: string,
    expected: Record<string, number>,
    actual: Record<string, number>
): {
    ok: boolean;
    rows: Array<{ metric: string; country: string; expected: number; actual: number }>;
} {
    const keys = Array.from(new Set([...Object.keys(expected), ...Object.keys(actual)])).sort();
    const rows = keys.map((k) => ({
        metric: label,
        country: k,
        expected: expected[k] ?? 0,
        actual: actual[k] ?? 0,
    }));
    return { ok: rows.every((r) => r.expected === r.actual), rows };
}

async function main(): Promise<void> {
    const sql = getDb();
    if (!sql) throw new Error('DATABASE_URL not configured. Cannot run parity report.');

    const manifest = readJson<BuildManifest>(join(OUT_DIR, 'manifest.json'));
    const retailers = readJson<RetailerSummary[]>(join(OUT_DIR, 'retailers.json'));
    const areas = readJson<AreaRecord[]>(join(OUT_DIR, 'areas.json'));
    const buildId = deriveBuildId(manifest);

    const expectedRetailers = countRetailersByCountry(retailers);
    const expectedAreas = countAreasByCountry(areas);
    const expectedStores = sumByCountry(retailers);

    const actualRetailers = await groupedCounts('atlas_retailers', buildId);
    const actualAreas = await groupedCounts('atlas_areas', buildId);
    const actualStores = await groupedCounts('atlas_stores', buildId);

    const r1 = compareMap('retailers', expectedRetailers, actualRetailers);
    const r2 = compareMap('areas', expectedAreas, actualAreas);
    const r3 = compareMap('stores', expectedStores, actualStores);

    const totalExpected = {
        retailers: retailers.length,
        areas: areas.length,
        stores: manifest.store_count,
    };
    const totalActualRows = (await sql.query(
        `SELECT
          (SELECT COUNT(*)::int FROM atlas_retailers WHERE build_id = $1) AS retailers,
          (SELECT COUNT(*)::int FROM atlas_areas WHERE build_id = $1) AS areas,
          (SELECT COUNT(*)::int FROM atlas_stores WHERE build_id = $1) AS stores`,
        [buildId]
    )) as Array<{ retailers: number; areas: number; stores: number }>;
    const totalActual = totalActualRows[0] ?? { retailers: 0, areas: 0, stores: 0 };

    console.log(`Neon parity report for build_id=${buildId}`);
    console.log('--- by country ---');
    console.table([...r1.rows, ...r2.rows, ...r3.rows]);
    console.log('--- totals ---');
    console.table([
        {
            metric: 'retailers',
            expected: totalExpected.retailers,
            actual: Number(totalActual.retailers),
        },
        { metric: 'areas', expected: totalExpected.areas, actual: Number(totalActual.areas) },
        { metric: 'stores', expected: totalExpected.stores, actual: Number(totalActual.stores) },
    ]);

    const totalsOk =
        totalExpected.retailers === Number(totalActual.retailers) &&
        totalExpected.areas === Number(totalActual.areas) &&
        totalExpected.stores === Number(totalActual.stores);
    const ok = r1.ok && r2.ok && r3.ok && totalsOk;
    console.log(ok ? 'PARITY: OK' : 'PARITY: MISMATCH');

    if (!ok && process.env.STRICT === '1') {
        process.exit(2);
    }
}

void main().catch((err) => {
    console.error(err);
    process.exit(1);
});
