#!/usr/bin/env tsx
/**
 * Resolve Elemental org NEIDs for every tracked retailer.
 *
 * For each entry in `scripts/lib/retailer-registry.ts`, runs a candidate
 * cascade through `POST /entities/search` with `flavors: ["organization"]`
 * to find the parent corporation. Cache written to
 * `data/neid_cache/retailer_neids.json` keyed by retailer slug.
 *
 * Privately-held retailers (Aldi, Trader Joe's, Subway, Chick-fil-A,
 * Hy-Vee) may not have an organization-flavored entity in the graph; the
 * script logs them in the report and the per-retailer events tab will
 * stay empty for those slugs until a manual override is recorded.
 *
 * Run:
 *   npm run expand:retailers
 *   RESET=1 npm run expand:retailers      # ignore cache
 *   MIN_SCORE=0.85 npm run expand:retailers
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import type { Country, RetailerMeta } from '../types/retail';
import { RETAILERS } from './lib/retailer-registry';

const ROOT = join(__dirname, '..');
const CACHE_PATH = join(ROOT, 'data', 'neid_cache', 'retailer_neids.json');
const REPORT_PATH = join(ROOT, 'data', 'neid_cache', 'retailer_neids_report.json');

const RESET = process.env.RESET === '1';
const MIN_SCORE = Number(process.env.MIN_SCORE ?? 0.95);

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

async function search(cfg: BroadchurchCfg, query: string): Promise<SearchMatch[]> {
    const res = await fetch(`${cfg.gatewayUrl}/api/qs/${cfg.orgId}/entities/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': cfg.apiKey },
        body: JSON.stringify({
            queries: [{ queryId: 1, query, flavors: ['organization'] }],
            maxResults: 5,
            includeNames: true,
        }),
    });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => '')}`);
    }
    const body = (await res.json()) as {
        results?: Array<{ matches?: SearchMatch[] }>;
    };
    return body.results?.[0]?.matches ?? [];
}

function legalSuffixesFor(country: Country): string[] {
    if (country === 'US') return ['Inc.', 'Corporation', 'Corp.', 'Co.', 'Companies'];
    if (country === 'UK') return ['PLC', 'Group', 'Ltd', 'Limited'];
    return ['Limited', 'Inc.', 'Companies', 'Corp.'];
}

function candidatesFor(meta: RetailerMeta): string[] {
    const cands = new Set<string>();
    const name = meta.name.trim();

    // Hand-tuned aliases for retailers whose legal entity name diverges
    // from the brand or where the public-facing display name carries
    // ambiguous tokens.
    const overrides: Record<string, string[]> = {
        walmart: ['Walmart Inc.', 'Walmart'],
        target: ['Target Corporation', 'Target Corp.'],
        costco: ['Costco Wholesale Corporation', 'Costco Wholesale'],
        kohls: ["Kohl's Corporation", "Kohl's"],
        home_depot: ['The Home Depot, Inc.', 'The Home Depot'],
        lowes: ["Lowe's Companies, Inc.", "Lowe's"],
        kroger: ['The Kroger Co.', 'Kroger'],
        albertsons: ['Albertsons Companies, Inc.', 'Albertsons'],
        publix: ['Publix Super Markets, Inc.', 'Publix'],
        aldi: ['ALDI', 'Aldi Sud', 'Aldi Süd', 'Aldi Inc.'],
        hy_vee: ['Hy-Vee, Inc.', 'Hy-Vee'],
        whole_foods: ['Whole Foods Market', 'Whole Foods Market, Inc.'],
        trader_joes: ["Trader Joe's Company", "Trader Joe's"],
        dollargeneral: ['Dollar General Corporation', 'Dollar General'],
        dollar_tree: ['Dollar Tree, Inc.', 'Dollar Tree'],
        family_dollar: ['Family Dollar Stores, Inc.', 'Family Dollar'],
        cvs: ['CVS Health Corporation', 'CVS Pharmacy', 'CVS Health'],
        walgreens: ['Walgreens Boots Alliance, Inc.', 'Walgreens'],
        mcdonalds: ["McDonald's Corporation", "McDonald's"],
        subway: ['Subway IP LLC', 'Subway'],
        chick_fil_a: ['Chick-fil-A, Inc.', 'Chick-fil-A'],
        chipotle: ['Chipotle Mexican Grill, Inc.', 'Chipotle Mexican Grill'],
        starbucks: ['Starbucks Corporation', 'Starbucks'],
        dunkin_donuts: ["Dunkin' Brands Group, Inc.", "Dunkin' Brands", 'Dunkin'],
        planet_fitness: ['Planet Fitness, Inc.', 'Planet Fitness'],
        lululemon: ['lululemon athletica inc.', 'lululemon athletica', 'lululemon'],
        tesco: ['Tesco PLC', 'Tesco'],
        booker: ['Booker Group', 'Booker'],
        onestop: ['One Stop Stores Ltd', 'One Stop'],
        loblaw: ['Loblaw Companies Limited', 'Loblaw Companies', 'Loblaw'],
    };

    if (overrides[meta.slug]) {
        for (const v of overrides[meta.slug]) cands.add(v);
    } else {
        for (const suffix of legalSuffixesFor(meta.country)) {
            cands.add(`${name} ${suffix}`);
        }
        cands.add(name);
    }

    return [...cands];
}

interface CacheEntry {
    neid: string | null;
    name: string | null;
    score: number | null;
    matched_query: string | null;
    resolved_at: string;
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

async function resolveOne(cfg: BroadchurchCfg, meta: RetailerMeta): Promise<CacheEntry> {
    const cands = candidatesFor(meta);
    let best: { match: SearchMatch; query: string } | null = null;

    for (const query of cands) {
        let matches: SearchMatch[];
        try {
            matches = await search(cfg, query);
        } catch (err) {
            console.warn(`  ${meta.slug}: search error '${query}' — ${(err as Error).message}`);
            continue;
        }
        for (const m of matches) {
            if (m.flavor !== 'organization') continue;
            if (m.score < MIN_SCORE) continue;
            if (!best || m.score > best.match.score) {
                best = { match: m, query };
            }
            if (m.score >= 0.999) break;
        }
        if (best && best.match.score >= 0.999) break;
    }

    if (!best) {
        return {
            neid: null,
            name: null,
            score: null,
            matched_query: null,
            resolved_at: new Date().toISOString(),
        };
    }

    return {
        neid: best.match.neid,
        name: best.match.name,
        score: best.match.score,
        matched_query: best.query,
        resolved_at: new Date().toISOString(),
    };
}

function fmtPct(x: number): string {
    return `${(x * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
    const cfg = readBroadchurch();
    const cache = loadCache();

    const targets = RETAILERS.filter((r) => RESET || !cache[r.slug]);
    console.log(`expand-retailer-neids`);
    console.log(`  total retailers: ${RETAILERS.length}`);
    console.log(`  cached: ${RETAILERS.length - targets.length}`);
    console.log(`  to resolve: ${targets.length}`);
    console.log(`  min score: ${MIN_SCORE}`);
    console.log('');

    const t0 = Date.now();
    for (const meta of targets) {
        const entry = await resolveOne(cfg, meta);
        cache[meta.slug] = entry;
        const tag = entry.neid ? '✓' : '·';
        console.log(
            `  ${tag} ${meta.slug.padEnd(18)} ${entry.neid ?? '(unresolved)'.padEnd(20)}` +
                `  score=${entry.score?.toFixed(3) ?? '   - '}  ${entry.name ?? ''}` +
                (entry.matched_query ? `  via "${entry.matched_query}"` : '')
        );
        saveCache(cache);
    }

    const total = RETAILERS.length;
    const resolved = RETAILERS.reduce((n, r) => n + (cache[r.slug]?.neid ? 1 : 0), 0);

    const byCountry: Record<string, { total: number; resolved: number }> = {};
    for (const r of RETAILERS) {
        const k = r.country;
        if (!byCountry[k]) byCountry[k] = { total: 0, resolved: 0 };
        byCountry[k].total += 1;
        if (cache[r.slug]?.neid) byCountry[k].resolved += 1;
    }

    const report = {
        generated_at: new Date().toISOString(),
        min_score: MIN_SCORE,
        total_retailers: total,
        resolved,
        unresolved: RETAILERS.filter((r) => !cache[r.slug]?.neid).map((r) => r.slug),
        elapsed_ms: Date.now() - t0,
        by_country: byCountry,
    };
    if (!existsSync(dirname(REPORT_PATH))) mkdirSync(dirname(REPORT_PATH), { recursive: true });
    writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

    console.log('');
    console.log(`Done in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
    console.log(`Cache: ${relative(ROOT, CACHE_PATH)}`);
    console.log(`Report: ${relative(ROOT, REPORT_PATH)}`);
    console.log('');
    console.log(`Coverage: ${resolved}/${total} (${fmtPct(resolved / Math.max(total, 1))})`);
    for (const [c, v] of Object.entries(byCountry)) {
        console.log(`  ${c}: ${v.resolved}/${v.total}`);
    }
    if (report.unresolved.length > 0) {
        console.log(`Unresolved: ${report.unresolved.join(', ')}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
