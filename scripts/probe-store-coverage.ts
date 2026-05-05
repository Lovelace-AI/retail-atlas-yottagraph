#!/usr/bin/env tsx
/**
 * Phase 0 — Elemental store-NEID coverage probe (DESIGN.md R5.1).
 *
 * Samples N stores per retailer and runs each through a candidate-query
 * cascade against `POST /entities/search`. Records the best hit per store
 * and classifies it as either:
 *
 *   strict   — name contains the store's city OR store_number, and flavor
 *              is `organization` or `location`. Counts as a per-store hit.
 *   loose    — any match with score >= MIN_SCORE, regardless of name. Often
 *              picks up the parent company; useful as an upper bound.
 *
 * Outputs:
 *   data/probes/store-coverage-{timestamp}.json   structured results
 *   data/probes/store-coverage-{timestamp}.md     human-readable summary
 *
 * Threshold gate (per R5.1):
 *   strict ≥ 60%  → build store-level NEIDs for the full roster
 *   30–60%        → conditional click-targets, fall back to shopping centers
 *   < 30%         → cancel Phase 2; pivot to area-only product
 *
 * Run:
 *     npm run probe:coverage              # default sample 100 / retailer
 *     SAMPLE=25 npm run probe:coverage    # quick smoke run
 *     RETAILERS=walmart,target,costco npm run probe:coverage
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { StoreRecord } from '../types/retail';
import { RETAILERS } from './lib/retailer-registry';

const ROOT = join(__dirname, '..');
const STORES_DIR = join(ROOT, 'public', 'data', 'retail_atlas', 'stores');
const OUT_DIR = join(ROOT, 'data', 'probes');

const SAMPLE = Number(process.env.SAMPLE ?? 100);
const MIN_SCORE = Number(process.env.MIN_SCORE ?? 0.75);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 4);
const BATCH_SIZE = 5;
const RETAILER_FILTER = (process.env.RETAILERS ?? '').split(',').filter(Boolean);

const ALLOWED_FLAVORS = new Set(['organization', 'location']);

interface BroadchurchYaml {
    gatewayUrl: string;
    orgId: string;
    apiKey: string;
}

function readBroadchurch(): BroadchurchYaml {
    const path = join(ROOT, 'broadchurch.yaml');
    if (!existsSync(path)) {
        throw new Error(`broadchurch.yaml not found at ${path}`);
    }
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
            `broadchurch.yaml missing one of gateway.url / tenant.org_id / gateway.qs_api_key`
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
}

async function searchBatch(
    cfg: BroadchurchYaml,
    queries: BatchQuery[]
): Promise<Map<number, SearchMatch[]>> {
    const url = `${cfg.gatewayUrl}/api/qs/${cfg.orgId}/entities/search`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': cfg.apiKey,
        },
        body: JSON.stringify({
            queries,
            maxResults: 5,
            includeNames: true,
        }),
    });
    if (!res.ok) {
        throw new Error(`entities/search HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const body = (await res.json()) as {
        results?: Array<{ queryId: number; matches?: SearchMatch[] }>;
    };
    const out = new Map<number, SearchMatch[]>();
    for (const r of body.results ?? []) {
        out.set(r.queryId, r.matches ?? []);
    }
    return out;
}

interface Candidate {
    label: string;
    query: string;
}

function candidatesFor(store: StoreRecord, retailerName: string): Candidate[] {
    // Empirically (see data/probes/), the Lovelace knowledge graph names
    // store-level entities as "{City} {Retailer} {Format}" — e.g.
    // "La Place Walmart Supercenter", "Broken Arrow Walmart Neighborhood
    // Market", "San Francisco Costco". Lead with city-first patterns.
    const cands: Candidate[] = [];
    const number = store.store_id.split('-').slice(1).join('-');
    const city = store.city ?? '';
    const region = store.region ?? '';
    const address = store.address ?? '';
    const fmt = store.format ?? '';

    if (city && fmt)
        cands.push({ label: 'city+name+fmt', query: `${city} ${retailerName} ${fmt}` });
    if (city) cands.push({ label: 'city+name', query: `${city} ${retailerName}` });
    if (city) cands.push({ label: 'name+city', query: `${retailerName} ${city}` });
    if (city && region && fmt)
        cands.push({
            label: 'name+fmt+city+region',
            query: `${retailerName} ${fmt} ${city}, ${region}`,
        });
    if (city && region)
        cands.push({ label: 'name+city+region', query: `${retailerName} ${city}, ${region}` });
    if (address && city)
        cands.push({ label: 'name+addr', query: `${retailerName} ${address}, ${city}` });
    if (number && city)
        cands.push({ label: 'name+num+city', query: `${retailerName} ${number} ${city}` });
    if (store.banner && city)
        cands.push({ label: 'banner+city', query: `${store.banner} ${city}` });

    return cands;
}

function isStrictMatch(store: StoreRecord, m: SearchMatch): boolean {
    if (m.score < MIN_SCORE) return false;
    if (!ALLOWED_FLAVORS.has(m.flavor)) return false;
    const name = m.name.toLowerCase();
    const city = (store.city ?? '').toLowerCase();
    const number = store.store_id.split('-').slice(1).join('-').toLowerCase();
    if (city && name.includes(city)) return true;
    if (number && number.length >= 3 && name.includes(number)) return true;
    return false;
}

function isLooseMatch(m: SearchMatch): boolean {
    return m.score >= MIN_SCORE && ALLOWED_FLAVORS.has(m.flavor);
}

interface StoreProbeResult {
    store_id: string;
    city: string | null;
    region: string | null;
    best_match: SearchMatch | null;
    matched_candidate: string | null;
    strict_hit: boolean;
    loose_hit: boolean;
}

interface RetailerProbeResult {
    slug: string;
    name: string;
    country: string;
    sample_size: number;
    strict_hits: number;
    loose_hits: number;
    strict_rate: number;
    loose_rate: number;
    elapsed_ms: number;
    sample: StoreProbeResult[];
}

function sampleStores(stores: StoreRecord[], n: number): StoreRecord[] {
    if (stores.length <= n) return stores.slice();
    const out: StoreRecord[] = [];
    const step = stores.length / n;
    for (let i = 0; i < n; i++) {
        out.push(stores[Math.floor(i * step)]);
    }
    return out;
}

async function probeRetailerSlow(
    cfg: BroadchurchYaml,
    slug: string,
    name: string,
    country: string,
    sample: StoreRecord[]
): Promise<RetailerProbeResult> {
    const t0 = Date.now();
    const results: StoreProbeResult[] = [];

    type Pending = {
        store: StoreRecord;
        cands: Candidate[];
        bestMatch: SearchMatch | null;
        bestLabel: string | null;
        idx: number;
    };
    const pending: Pending[] = sample.map((s) => ({
        store: s,
        cands: candidatesFor(s, name),
        bestMatch: null,
        bestLabel: null,
        idx: 0,
    }));

    // Cascade: try the i-th candidate for everyone in parallel batches; whenever
    // a store finds a strict match, it stops queueing further candidates.
    let round = 0;
    while (
        pending.some(
            (p) => p.idx < p.cands.length && (!p.bestMatch || !isStrictMatch(p.store, p.bestMatch))
        )
    ) {
        const queue: Array<{ p: Pending; cand: Candidate; queryId: number }> = [];
        for (const p of pending) {
            if (p.idx >= p.cands.length) continue;
            if (p.bestMatch && isStrictMatch(p.store, p.bestMatch)) continue;
            const cand = p.cands[p.idx];
            p.idx += 1;
            queue.push({ p, cand, queryId: queue.length + 1 });
        }
        if (queue.length === 0) break;

        for (let i = 0; i < queue.length; i += BATCH_SIZE * CONCURRENCY) {
            const concurrentChunks: Array<typeof queue> = [];
            for (let c = 0; c < CONCURRENCY; c++) {
                const start = i + c * BATCH_SIZE;
                const slice = queue.slice(start, start + BATCH_SIZE);
                if (slice.length > 0) concurrentChunks.push(slice);
            }
            await Promise.all(
                concurrentChunks.map(async (chunk) => {
                    const queries = chunk.map((q, idx) => ({
                        queryId: idx + 1,
                        query: q.cand.query,
                    }));
                    let matches: Map<number, SearchMatch[]> = new Map();
                    try {
                        matches = await searchBatch(cfg, queries);
                    } catch (err) {
                        console.warn(`  ${slug}: batch error: ${(err as Error).message}`);
                        return;
                    }
                    chunk.forEach((entry, idx) => {
                        const ms = matches.get(idx + 1) ?? [];
                        for (const m of ms) {
                            if (!isLooseMatch(m)) continue;
                            if (!entry.p.bestMatch || m.score > entry.p.bestMatch.score) {
                                entry.p.bestMatch = m;
                                entry.p.bestLabel = entry.cand.label;
                            }
                            // If we hit strict on this candidate, no need to walk further.
                            if (isStrictMatch(entry.p.store, m)) {
                                entry.p.bestMatch = m;
                                entry.p.bestLabel = entry.cand.label;
                                break;
                            }
                        }
                    });
                })
            );
        }
        round += 1;
    }

    let strict_hits = 0;
    let loose_hits = 0;
    for (const p of pending) {
        const sm = p.bestMatch && isStrictMatch(p.store, p.bestMatch);
        const lm = p.bestMatch !== null;
        if (sm) strict_hits += 1;
        if (lm) loose_hits += 1;
        results.push({
            store_id: p.store.store_id,
            city: p.store.city,
            region: p.store.region,
            best_match: p.bestMatch,
            matched_candidate: p.bestLabel,
            strict_hit: !!sm,
            loose_hit: lm,
        });
    }

    return {
        slug,
        name,
        country,
        sample_size: sample.length,
        strict_hits,
        loose_hits,
        strict_rate: sample.length === 0 ? 0 : strict_hits / sample.length,
        loose_rate: sample.length === 0 ? 0 : loose_hits / sample.length,
        elapsed_ms: Date.now() - t0,
        sample: results,
    };
}

function fmtPct(x: number): string {
    return `${(x * 100).toFixed(1)}%`;
}

function fmtMs(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
}

function decisionTier(strict: number): string {
    if (strict >= 0.6) return 'GREEN — build store-level NEIDs for the full roster';
    if (strict >= 0.3) return 'YELLOW — conditional click-targets, fall back to shopping centers';
    return 'RED — cancel Phase 2, pivot to area-only product';
}

function writeMarkdown(
    outPath: string,
    results: RetailerProbeResult[],
    overall: {
        sample: number;
        strict: number;
        loose: number;
        strict_rate: number;
        loose_rate: number;
        elapsed_ms: number;
    }
): void {
    const lines: string[] = [];
    lines.push(`# Phase 0 store-NEID coverage probe`);
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push(`Sample size per retailer: ${SAMPLE}`);
    lines.push(`Score threshold (MIN_SCORE): ${MIN_SCORE}`);
    lines.push(`Allowed flavors: ${[...ALLOWED_FLAVORS].join(', ')}`);
    lines.push('');
    lines.push(`## Overall`);
    lines.push('');
    lines.push(`- Stores sampled: **${overall.sample}**`);
    lines.push(`- Strict hit-rate: **${fmtPct(overall.strict_rate)}** (${overall.strict} stores)`);
    lines.push(`- Loose hit-rate: ${fmtPct(overall.loose_rate)} (${overall.loose} stores)`);
    lines.push(`- Elapsed: ${fmtMs(overall.elapsed_ms)}`);
    lines.push('');
    lines.push(`**Decision (R5.1):** ${decisionTier(overall.strict_rate)}`);
    lines.push('');
    lines.push(`## Per-retailer`);
    lines.push('');
    lines.push(`| Retailer | Country | Sample | Strict | Loose | Strict % | Loose % | Tier |`);
    lines.push(`| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |`);
    for (const r of [...results].sort((a, b) => b.strict_rate - a.strict_rate)) {
        const tier = decisionTier(r.strict_rate).split(' — ')[0];
        lines.push(
            `| ${r.name} | ${r.country} | ${r.sample_size} | ${r.strict_hits} | ${r.loose_hits} | ${fmtPct(r.strict_rate)} | ${fmtPct(r.loose_rate)} | ${tier} |`
        );
    }
    lines.push('');
    lines.push(`## Notes`);
    lines.push('');
    lines.push(
        `- "Strict" requires the search match name to contain the store's city or store number AND have flavor in {organization, location} AND score ≥ ${MIN_SCORE}. This filters parent-company matches that would otherwise inflate the apparent rate.`
    );
    lines.push(
        `- "Loose" is any match passing flavor + score thresholds. Useful as an upper bound; treat with caution.`
    );
    lines.push(`- Per-store JSON sample is in the sibling \`.json\` file.`);
    writeFileSync(outPath, lines.join('\n') + '\n');
}

async function main(): Promise<void> {
    const cfg = readBroadchurch();
    if (!existsSync(STORES_DIR)) {
        throw new Error(`Run 'npm run build:data' first — ${STORES_DIR} not found`);
    }
    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

    const filter = new Set(RETAILER_FILTER);
    const targets = filter.size === 0 ? RETAILERS : RETAILERS.filter((r) => filter.has(r.slug));
    if (targets.length === 0) {
        throw new Error(`No retailers selected (RETAILERS env: ${process.env.RETAILERS})`);
    }

    console.log(`Phase 0 store-NEID coverage probe`);
    console.log(`  retailers: ${targets.length}`);
    console.log(`  sample: ${SAMPLE} per retailer`);
    console.log(`  min score: ${MIN_SCORE}`);
    console.log(`  concurrency: ${CONCURRENCY} × batch ${BATCH_SIZE}`);
    console.log('');

    const results: RetailerProbeResult[] = [];
    const t0 = Date.now();

    for (const meta of targets) {
        const path = join(STORES_DIR, `${meta.slug}.json`);
        if (!existsSync(path)) {
            console.warn(`  ${meta.slug}: missing ${path}, skipping`);
            continue;
        }
        const all = JSON.parse(readFileSync(path, 'utf-8')) as StoreRecord[];
        const sample = sampleStores(all, SAMPLE);
        const result = await probeRetailerSlow(cfg, meta.slug, meta.name, meta.country, sample);
        results.push(result);
        console.log(
            `  ${meta.slug.padEnd(18)} strict ${fmtPct(result.strict_rate).padStart(6)}  loose ${fmtPct(result.loose_rate).padStart(6)}  (${result.strict_hits}/${result.sample_size} strict, ${fmtMs(result.elapsed_ms)})`
        );
    }

    const overall = results.reduce(
        (acc, r) => ({
            sample: acc.sample + r.sample_size,
            strict: acc.strict + r.strict_hits,
            loose: acc.loose + r.loose_hits,
        }),
        { sample: 0, strict: 0, loose: 0 }
    );
    const overallRates = {
        ...overall,
        strict_rate: overall.sample === 0 ? 0 : overall.strict / overall.sample,
        loose_rate: overall.sample === 0 ? 0 : overall.loose / overall.sample,
        elapsed_ms: Date.now() - t0,
    };

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = join(OUT_DIR, `store-coverage-${ts}.json`);
    const mdPath = join(OUT_DIR, `store-coverage-${ts}.md`);

    writeFileSync(
        jsonPath,
        JSON.stringify(
            {
                generated_at: new Date().toISOString(),
                sample_per_retailer: SAMPLE,
                min_score: MIN_SCORE,
                results,
                overall: overallRates,
            },
            null,
            2
        )
    );
    writeMarkdown(mdPath, results, overallRates);

    console.log('');
    console.log(
        `Overall: strict ${fmtPct(overallRates.strict_rate)} (${overall.strict}/${overall.sample}), loose ${fmtPct(overallRates.loose_rate)}`
    );
    console.log(`Decision: ${decisionTier(overallRates.strict_rate)}`);
    console.log('');
    console.log(`Wrote ${relative(ROOT, jsonPath)}`);
    console.log(`Wrote ${relative(ROOT, mdPath)}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
