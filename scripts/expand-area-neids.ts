#!/usr/bin/env tsx
/**
 * Resolve Elemental NEIDs for every Area Record we track.
 *
 * Reads `public/data/retail_atlas/areas.json` (emitted by build-retail-data),
 * runs each area through a country-specific candidate cascade against
 * `POST /entities/search`, and writes the resolved (or null) NEID into
 * `data/neid_cache/area_neids.json` keyed by `area_key`. The next
 * `npm run build:data` call merges this cache into the emitted areas.json
 * so the runtime sees `area.neid` populated.
 *
 * Idempotent — re-runs skip already-resolved keys unless RESET=1.
 *
 * Run:
 *   npm run expand:areas               # full sweep
 *   COUNTRIES=US npm run expand:areas  # one country only
 *   LIMIT=50 npm run expand:areas      # smoke test
 *   RESET=1 npm run expand:areas       # ignore cache
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import type { AreaRecord } from '../types/retail';
import { expandCAProvince, expandUSRegion, usStateNameFromFips } from './lib/region-names';

const ROOT = join(__dirname, '..');
const AREAS_PATH = join(ROOT, 'public', 'data', 'retail_atlas', 'areas.json');
const CACHE_PATH = join(ROOT, 'data', 'neid_cache', 'area_neids.json');
const REPORT_PATH = join(ROOT, 'data', 'neid_cache', 'area_neids_report.json');

const COUNTRIES = (process.env.COUNTRIES ?? 'US,UK,CA').split(',').filter(Boolean);
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const RESET = process.env.RESET === '1';
const MIN_SCORE = Number(process.env.MIN_SCORE ?? 0.85);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const BATCH_SIZE = 5;

interface BroadchurchCfg {
    gatewayUrl: string;
    orgId: string;
    apiKey: string;
}

function readBroadchurch(): BroadchurchCfg {
    const path = join(ROOT, 'broadchurch.yaml');
    if (!existsSync(path)) throw new Error(`broadchurch.yaml not found: ${path}`);
    const yaml = readFileSync(path, 'utf-8');
    const grab = (key: string): string => {
        const re = new RegExp(`^\\s*${key}:\\s*["']?([^"'\\n#]+)["']?\\s*(?:#.*)?$`, 'm');
        const m = yaml.match(re);
        return m ? m[1].trim() : '';
    };
    const cfg = {
        gatewayUrl: grab('url').replace(/\/$/, ''),
        orgId: grab('org_id'),
        apiKey: grab('qs_api_key'),
    };
    if (!cfg.gatewayUrl || !cfg.orgId || !cfg.apiKey) {
        throw new Error(
            'broadchurch.yaml missing gateway.url / tenant.org_id / gateway.qs_api_key'
        );
    }
    return cfg;
}

interface SearchMatch {
    neid: string;
    name: string;
    flavor: string;
    score: number;
}

interface BatchQuery {
    queryId: number;
    query: string;
    flavors?: string[];
}

async function searchBatch(
    cfg: BroadchurchCfg,
    queries: BatchQuery[]
): Promise<Map<number, SearchMatch[]>> {
    const url = `${cfg.gatewayUrl}/api/qs/${cfg.orgId}/entities/search`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': cfg.apiKey },
        body: JSON.stringify({ queries, maxResults: 5, includeNames: true }),
    });
    if (!res.ok) {
        throw new Error(`entities/search HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const body = (await res.json()) as {
        results?: Array<{ queryId: number; matches?: SearchMatch[] }>;
    };
    const out = new Map<number, SearchMatch[]>();
    for (const r of body.results ?? []) out.set(r.queryId, r.matches ?? []);
    return out;
}

interface Candidate {
    label: string;
    query: string;
}

function candidatesFor(area: AreaRecord): Candidate[] {
    const cands: Candidate[] = [];
    const name = (area.area_name ?? '').trim();
    const region = (area.region ?? '').trim();

    if (area.country === 'US') {
        // region is a 2-letter state code; expand to full name.
        const stateFull = expandUSRegion(region) || usStateNameFromFips(area.area_code);
        const fallbackName = name || `FIPS ${area.area_code}`;
        if (name && stateFull) {
            cands.push({ label: 'name+state', query: `${name}, ${stateFull}` });
            if (!/county|parish|borough|census area/i.test(name)) {
                cands.push({ label: 'name+county+state', query: `${name} County, ${stateFull}` });
            }
        }
        if (name && region) {
            cands.push({ label: 'name+abbrev', query: `${name}, ${region}` });
        }
        if (!name && stateFull) {
            cands.push({ label: 'fips+state', query: `${fallbackName}, ${stateFull}` });
        }
    } else if (area.country === 'UK') {
        if (name) {
            cands.push({ label: 'name+uk', query: `${name}, United Kingdom` });
            cands.push({ label: 'name+england', query: `${name}, England` });
            cands.push({ label: 'name', query: name });
        }
    } else if (area.country === 'CA') {
        const provFull = expandCAProvince(region);
        if (area.area_type === 'province') {
            if (provFull) {
                cands.push({ label: 'province+canada', query: `${provFull}, Canada` });
                cands.push({ label: 'province', query: provFull });
            }
            if (region) cands.push({ label: 'province-code', query: region });
        } else {
            // CMA
            if (name && provFull) {
                cands.push({
                    label: 'name+prov+canada',
                    query: `${name}, ${provFull}, Canada`,
                });
                cands.push({ label: 'name+prov', query: `${name}, ${provFull}` });
            }
            if (name) cands.push({ label: 'name+canada', query: `${name}, Canada` });
            if (name) cands.push({ label: 'name', query: name });
        }
    }
    return cands;
}

interface ResolveResult {
    area_key: string;
    neid: string | null;
    name: string | null;
    score: number | null;
    flavor: string | null;
    matched_candidate: string | null;
}

interface CacheEntry {
    neid: string | null;
    name: string | null;
    score: number | null;
    flavor: string | null;
    matched_candidate: string | null;
    resolved_at: string;
}

function isAcceptableMatch(area: AreaRecord, m: SearchMatch): boolean {
    if (m.score < MIN_SCORE) return false;
    if (m.flavor !== 'location' && m.flavor !== 'region') return false;
    const lc = m.name.toLowerCase();
    const name = (area.area_name ?? '').toLowerCase();
    if (name && !lc.includes(name.split(' county')[0].split(' parish')[0])) {
        // Soft check: if the area has a name, make sure it appears (or a
        // substring of it) in the matched name. This catches cases like
        // "Manchester" matching "Manchester, New Hampshire" instead of the
        // UK Manchester — without anchoring on country.
        if (
            area.country === 'UK' &&
            !/(united kingdom|england|scotland|wales|northern ireland)/i.test(m.name)
        ) {
            return false;
        }
        if (area.country === 'CA' && !/canada/i.test(m.name)) {
            return false;
        }
    }
    return true;
}

function loadCache(): Record<string, CacheEntry> {
    if (RESET || !existsSync(CACHE_PATH)) return {};
    try {
        return JSON.parse(readFileSync(CACHE_PATH, 'utf-8'));
    } catch {
        return {};
    }
}

function saveCache(cache: Record<string, CacheEntry>): void {
    if (!existsSync(dirname(CACHE_PATH))) mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function resolveOne(cfg: BroadchurchCfg, area: AreaRecord): Promise<ResolveResult> {
    const cands = candidatesFor(area);
    if (cands.length === 0) {
        return {
            area_key: area.area_key,
            neid: null,
            name: null,
            score: null,
            flavor: null,
            matched_candidate: null,
        };
    }

    let best: { match: SearchMatch; cand: Candidate } | null = null;

    // Walk candidates in batches of BATCH_SIZE.
    for (let i = 0; i < cands.length; i += BATCH_SIZE) {
        const slice = cands.slice(i, i + BATCH_SIZE);
        const queries: BatchQuery[] = slice.map((c, idx) => ({
            queryId: idx + 1,
            query: c.query,
            flavors: ['location', 'region'],
        }));
        let matches: Map<number, SearchMatch[]>;
        try {
            matches = await searchBatch(cfg, queries);
        } catch (err) {
            console.warn(`  ${area.area_key}: batch error ${(err as Error).message}`);
            continue;
        }
        for (let j = 0; j < slice.length; j++) {
            const ms = matches.get(j + 1) ?? [];
            for (const m of ms) {
                if (!isAcceptableMatch(area, m)) continue;
                if (!best || m.score > best.match.score) {
                    best = { match: m, cand: slice[j] };
                }
                if (m.score >= 0.99) break;
            }
            if (best && best.match.score >= 0.99) break;
        }
        if (best && best.match.score >= 0.99) break;
    }

    if (!best) {
        return {
            area_key: area.area_key,
            neid: null,
            name: null,
            score: null,
            flavor: null,
            matched_candidate: null,
        };
    }
    return {
        area_key: area.area_key,
        neid: best.match.neid,
        name: best.match.name,
        score: best.match.score,
        flavor: best.match.flavor,
        matched_candidate: best.cand.label,
    };
}

async function workQueue<T>(
    items: T[],
    concurrency: number,
    fn: (t: T) => Promise<void>
): Promise<void> {
    let i = 0;
    const workers: Promise<void>[] = [];
    for (let w = 0; w < concurrency; w++) {
        workers.push(
            (async () => {
                while (true) {
                    const idx = i++;
                    if (idx >= items.length) return;
                    await fn(items[idx]);
                }
            })()
        );
    }
    await Promise.all(workers);
}

function fmtPct(x: number): string {
    return `${(x * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
    const cfg = readBroadchurch();
    if (!existsSync(AREAS_PATH)) {
        throw new Error(`Run 'npm run build:data' first — missing ${AREAS_PATH}`);
    }
    const areas: AreaRecord[] = JSON.parse(readFileSync(AREAS_PATH, 'utf-8'));
    const filter = new Set(COUNTRIES);
    const targets = areas.filter((a) => filter.has(a.country));

    const cache = loadCache();
    let toRun: AreaRecord[];
    if (RESET) {
        toRun = targets.slice();
    } else {
        toRun = targets.filter((a) => !cache[a.area_key]);
    }
    if (LIMIT < toRun.length) toRun = toRun.slice(0, LIMIT);

    console.log(`expand-area-neids`);
    console.log(`  countries: ${[...filter].join(', ')}`);
    console.log(`  total areas in scope: ${targets.length}`);
    console.log(`  cached already: ${targets.length - toRun.length}`);
    console.log(`  to resolve now: ${toRun.length}`);
    console.log(`  concurrency: ${CONCURRENCY}, min score: ${MIN_SCORE}`);
    console.log('');

    const t0 = Date.now();
    let done = 0;
    let resolved = 0;
    const startCacheCount = Object.keys(cache).length;

    await workQueue(toRun, CONCURRENCY, async (area) => {
        const result = await resolveOne(cfg, area);
        cache[area.area_key] = {
            neid: result.neid,
            name: result.name,
            score: result.score,
            flavor: result.flavor,
            matched_candidate: result.matched_candidate,
            resolved_at: new Date().toISOString(),
        };
        done += 1;
        if (result.neid) resolved += 1;
        if (done % 50 === 0 || done === toRun.length) {
            const elapsed = (Date.now() - t0) / 1000;
            const rate = done / elapsed;
            const eta = (toRun.length - done) / Math.max(rate, 0.01);
            console.log(
                `  ${done}/${toRun.length}  resolved ${resolved} (${fmtPct(resolved / Math.max(done, 1))})` +
                    `  ${rate.toFixed(1)}/s  eta ${eta.toFixed(0)}s`
            );
            saveCache(cache);
        }
    });

    saveCache(cache);

    // Summary across the entire targets set (cached + new)
    const total = targets.length;
    const totalResolved = targets.reduce((n, a) => n + (cache[a.area_key]?.neid ? 1 : 0), 0);
    const byCountry: Record<string, { total: number; resolved: number }> = {};
    for (const a of targets) {
        const k = a.country;
        if (!byCountry[k]) byCountry[k] = { total: 0, resolved: 0 };
        byCountry[k].total += 1;
        if (cache[a.area_key]?.neid) byCountry[k].resolved += 1;
    }

    const report = {
        generated_at: new Date().toISOString(),
        countries: [...filter],
        min_score: MIN_SCORE,
        total_areas: total,
        resolved: totalResolved,
        new_resolutions: Object.keys(cache).length - startCacheCount,
        elapsed_ms: Date.now() - t0,
        by_country: byCountry,
    };
    if (!existsSync(dirname(REPORT_PATH))) mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log('');
    console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
    console.log(`Cache: ${relative(ROOT, CACHE_PATH)} (${Object.keys(cache).length} entries)`);
    console.log(`Report: ${relative(ROOT, REPORT_PATH)}`);
    console.log('');
    console.log(`Coverage:`);
    for (const [c, v] of Object.entries(byCountry)) {
        console.log(
            `  ${c}: ${v.resolved}/${v.total} (${fmtPct(v.resolved / Math.max(v.total, 1))})`
        );
    }
    console.log(
        `  Overall: ${totalResolved}/${total} (${fmtPct(totalResolved / Math.max(total, 1))})`
    );
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
