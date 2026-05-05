#!/usr/bin/env tsx
/**
 * Topojson boundary fetch + bundling.
 *
 * Populates public/data/topojson/ with the boundary files the Atlas map
 * canvas needs to render administrative polygons keyed off the Area Records
 * emitted by build-retail-data.ts.
 *
 * Sources:
 *   us/        us-atlas npm package (pre-built TopoJSON, 2017 vintage)
 *              counties-10m.json: county features keyed by 5-digit FIPS
 *              states-10m.json, nation-10m.json
 *   world/     world-atlas npm package (Natural Earth country outlines)
 *   uk/        ONS Open Geography Portal — Local Authority Districts
 *              (Dec 2024 BSC, simplified server-side via maxAllowableOffset).
 *              Paginated GeoJSON → TopoJSON via topojson-server.
 *   ca/        Statistics Canada — Census Metropolitan Areas + Census
 *              Agglomerations (2021 CBF, simplified). Same pipeline as UK.
 *
 * Run:
 *     npm run build:topojson
 */

import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { topology } from 'topojson-server';

const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'data', 'topojson');

interface GeoJsonFeature {
    type: 'Feature';
    id?: string | number;
    geometry: unknown;
    properties: Record<string, unknown>;
}

interface GeoJsonFeatureCollection {
    type: 'FeatureCollection';
    features: GeoJsonFeature[];
}

function ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function resolvePackageFile(packageName: string, file: string): string {
    const url = require.resolve(`${packageName}/package.json`);
    return join(dirname(url), file);
}

function copyPackageFile(packageName: string, file: string, destDir: string): number {
    const src = resolvePackageFile(packageName, file);
    if (!existsSync(src)) {
        throw new Error(`Missing ${packageName}/${file} (${src}) — is it installed?`);
    }
    ensureDir(destDir);
    const dest = join(destDir, file);
    copyFileSync(src, dest);
    return statSync(dest).size;
}

interface ArcGisPageOptions {
    baseUrl: string;
    outFields: string;
    maxAllowableOffset?: number;
    pageSize?: number;
}

async function fetchArcGisGeoJson(
    label: string,
    opts: ArcGisPageOptions
): Promise<GeoJsonFeatureCollection> {
    const pageSize = opts.pageSize ?? 200;
    const all: GeoJsonFeatureCollection = { type: 'FeatureCollection', features: [] };

    let offset = 0;
    let pages = 0;
    while (true) {
        const params = new URLSearchParams({
            where: '1=1',
            outFields: opts.outFields,
            f: 'geojson',
            returnGeometry: 'true',
            resultOffset: String(offset),
            resultRecordCount: String(pageSize),
            outSR: '4326',
        });
        if (opts.maxAllowableOffset !== undefined) {
            params.set('maxAllowableOffset', String(opts.maxAllowableOffset));
        }

        const url = `${opts.baseUrl}?${params.toString()}`;
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`${label}: HTTP ${res.status} from ${url}`);
        }
        const body = (await res.json()) as GeoJsonFeatureCollection & {
            properties?: { exceededTransferLimit?: boolean };
        };
        const features = body.features ?? [];
        all.features.push(...features);
        pages += 1;

        const limited = body.properties?.exceededTransferLimit === true;
        if (features.length < pageSize && !limited) break;
        offset += pageSize;

        // Hard cap so we don't loop forever on a misconfigured endpoint.
        if (pages > 100) {
            throw new Error(`${label}: paginated past 100 pages — bailing out`);
        }
    }

    console.log(`  ${label}: fetched ${all.features.length} features in ${pages} page(s)`);
    return all;
}

function writeTopo(destPath: string, fc: GeoJsonFeatureCollection, layerName: string): number {
    const topo = topology({ [layerName]: fc as never });
    const text = JSON.stringify(topo);
    writeFileSync(destPath, text);
    return Buffer.byteLength(text, 'utf8');
}

async function main(): Promise<void> {
    ensureDir(OUT_DIR);

    console.log('US (us-atlas)');
    const usDir = join(OUT_DIR, 'us');
    ensureDir(usDir);
    for (const f of ['counties-10m.json', 'states-10m.json', 'nation-10m.json']) {
        const bytes = copyPackageFile('us-atlas', f, usDir);
        console.log(`  copied ${f.padEnd(22)} ${fmtBytes(bytes)}`);
    }

    console.log('');
    console.log('World (world-atlas)');
    const worldDir = join(OUT_DIR, 'world');
    ensureDir(worldDir);
    for (const f of ['countries-50m.json', 'countries-110m.json']) {
        try {
            const bytes = copyPackageFile('world-atlas', f, worldDir);
            console.log(`  copied ${f.padEnd(22)} ${fmtBytes(bytes)}`);
        } catch (err) {
            console.warn(`  skipped ${f}: ${(err as Error).message}`);
        }
    }

    console.log('');
    console.log('UK LADs (ONS Open Geography Portal — Dec 2024 BSC)');
    const ukDir = join(OUT_DIR, 'uk');
    ensureDir(ukDir);
    const ukGeo = await fetchArcGisGeoJson('UK LADs', {
        baseUrl:
            'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/LAD_DEC_24_UK_BSC/FeatureServer/0/query',
        outFields: 'LAD24CD,LAD24NM',
        maxAllowableOffset: 0.001,
        pageSize: 200,
    });
    for (const feature of ukGeo.features) {
        // topojson-server promotes feature.id to geometry.id; properties survive on .properties.
        // Atlas joins on geometry.id == StoreRecord.area_code, so set it explicitly here.
        const code = String(feature.properties?.LAD24CD ?? '');
        const name = String(feature.properties?.LAD24NM ?? '');
        feature.id = code;
        feature.properties = { name, code };
    }
    const ukBytes = writeTopo(join(ukDir, 'lads.topojson.json'), ukGeo, 'lads');
    console.log(`  wrote lads.topojson.json   ${fmtBytes(ukBytes)}`);

    console.log('');
    console.log('CA CMAs (Statistics Canada — 2021 CBF)');
    const caDir = join(OUT_DIR, 'ca');
    ensureDir(caDir);
    const caGeo = await fetchArcGisGeoJson('CA CMAs', {
        baseUrl:
            'https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/6/query',
        outFields: 'CMAUID,CMAPUID,CMANAME,CMATYPE',
        maxAllowableOffset: 0.01,
        pageSize: 100,
    });
    for (const feature of caGeo.features) {
        const code = String(feature.properties?.CMAUID ?? '');
        const name = String(feature.properties?.CMANAME ?? '');
        const cmaType = String(feature.properties?.CMATYPE ?? '');
        feature.id = code;
        feature.properties = { name, code, cma_type: cmaType };
    }
    const caBytes = writeTopo(join(caDir, 'cmas.topojson.json'), caGeo, 'cmas');
    console.log(`  wrote cmas.topojson.json   ${fmtBytes(caBytes)}`);

    console.log('');
    console.log(`Done. Output: ${relative(ROOT, OUT_DIR)}/`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
