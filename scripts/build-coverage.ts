#!/usr/bin/env tsx
/**
 * Generate `COVERAGE.md` from the existing report JSONs.
 *
 * Reads:
 *   - data/neid_cache/area_neids_report.json
 *   - data/neid_cache/retailer_neids_report.json
 *   - data/neid_cache/area_neids.json (per-retailer area resolution rates)
 *   - data/neid_cache/retailer_neids.json (resolved name + score per retailer)
 *   - public/data/retail_atlas/{retailers,areas}.json (counts)
 *   - latest data/probes/store-coverage-*.json (Phase-0 result)
 *
 * Emits a deterministic Markdown summary that the PRD R12 deliverable
 * names `COVERAGE.md`. Re-run any time the cache or probe artifacts
 * change:
 *
 *     npm run build:coverage
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import type { AreaRecord, RetailerSummary } from '../types/retail';

const ROOT = join(__dirname, '..');
const AREAS_REPORT = join(ROOT, 'data', 'neid_cache', 'area_neids_report.json');
const AREAS_CACHE = join(ROOT, 'data', 'neid_cache', 'area_neids.json');
const RETAILERS_REPORT = join(ROOT, 'data', 'neid_cache', 'retailer_neids_report.json');
const RETAILERS_CACHE = join(ROOT, 'data', 'neid_cache', 'retailer_neids.json');
const RUNTIME_AREAS = join(ROOT, 'public', 'data', 'retail_atlas', 'areas.json');
const RUNTIME_RETAILERS = join(ROOT, 'public', 'data', 'retail_atlas', 'retailers.json');
const PROBES_DIR = join(ROOT, 'data', 'probes');
const OUT_PATH = join(ROOT, 'COVERAGE.md');

interface AreaReport {
    generated_at: string;
    total_areas: number;
    resolved: number;
    by_country: Record<string, { total: number; resolved: number }>;
}

interface RetailerReport {
    generated_at: string;
    total_retailers: number;
    resolved: number;
    unresolved: string[];
    by_country: Record<string, { total: number; resolved: number }>;
}

interface AreaCacheEntry {
    neid: string | null;
    name: string | null;
    score: number | null;
}

interface RetailerCacheEntry {
    neid: string | null;
    name: string | null;
    score: number | null;
    matched_query: string | null;
}

interface StoreProbeResult {
    overall: {
        sample: number;
        strict: number;
        loose: number;
        strict_rate: number;
        loose_rate: number;
        elapsed_ms: number;
    };
    results: Array<{
        slug: string;
        name: string;
        country: string;
        sample_size: number;
        strict_hits: number;
        loose_hits: number;
        strict_rate: number;
        loose_rate: number;
    }>;
    sample_per_retailer?: number;
    generated_at: string;
}

function readJSON<T>(path: string): T | null {
    if (!existsSync(path)) return null;
    try {
        return JSON.parse(readFileSync(path, 'utf-8')) as T;
    } catch {
        return null;
    }
}

function pct(n: number, d: number): string {
    if (d <= 0) return '—';
    return `${((n / d) * 100).toFixed(1)}%`;
}

function fmtCount(n: number): string {
    return n.toLocaleString();
}

function latestStoreCoverage(): StoreProbeResult | null {
    if (!existsSync(PROBES_DIR)) return null;
    const files = readdirSync(PROBES_DIR)
        .filter((f) => f.startsWith('store-coverage-') && f.endsWith('.json'))
        .sort();
    if (files.length === 0) return null;
    const latest = files[files.length - 1];
    return readJSON<StoreProbeResult>(join(PROBES_DIR, latest));
}

function buildPerRetailerAreaTable(retailers: RetailerSummary[], areas: AreaRecord[]): string {
    // For each retailer, count: areas with at least one store of theirs vs
    // those areas where the area NEID is resolved.
    const out: string[] = [];
    out.push(
        '| Retailer | Country | Stores | Areas (with stores) | Areas (NEID resolved) | Resolution rate |'
    );
    out.push('| --- | --- | ---: | ---: | ---: | ---: |');
    for (const r of [...retailers].sort((a, b) => b.store_count - a.store_count)) {
        let total = 0;
        let resolved = 0;
        for (const a of areas) {
            const c = a.store_counts_by_retailer[r.slug] ?? 0;
            if (c <= 0) continue;
            total += 1;
            if (a.neid) resolved += 1;
        }
        out.push(
            `| ${r.name} | ${r.country} | ${fmtCount(r.store_count)} | ${fmtCount(total)} | ${fmtCount(resolved)} | ${pct(resolved, total)} |`
        );
    }
    return out.join('\n');
}

function buildRetailerNeidTable(
    retailers: RetailerSummary[],
    cache: Record<string, RetailerCacheEntry>
): string {
    const out: string[] = [];
    out.push('| Retailer | Country | Resolved name | Score | Matched query |');
    out.push('| --- | --- | --- | ---: | --- |');
    for (const r of [...retailers].sort((a, b) =>
        a.country !== b.country ? a.country.localeCompare(b.country) : a.slug.localeCompare(b.slug)
    )) {
        const e = cache[r.slug];
        if (!e?.neid) {
            out.push(`| ${r.name} | ${r.country} | _(unresolved)_ | — | — |`);
            continue;
        }
        out.push(
            `| ${r.name} | ${r.country} | ${e.name ?? '?'} | ${(e.score ?? 0).toFixed(3)} | \`${e.matched_query ?? ''}\` |`
        );
    }
    return out.join('\n');
}

function buildHeader(report: AreaReport, retReport: RetailerReport): string {
    const lines: string[] = [];
    lines.push('# Retail Atlas — Coverage');
    lines.push('');
    lines.push(`> Auto-generated. Regenerate with \`npm run build:coverage\` after`);
    lines.push(`> running \`expand:areas\` / \`expand:retailers\` / \`probe:coverage\`.`);
    lines.push(`> Last regenerated: ${new Date().toISOString()}`);
    lines.push('');
    lines.push(`## Headline numbers`);
    lines.push('');
    lines.push(
        `- **Areas with NEID resolved**: ${fmtCount(report.resolved)} / ${fmtCount(report.total_areas)} (${pct(report.resolved, report.total_areas)}). Source: ${relative(ROOT, AREAS_REPORT)} (${report.generated_at}).`
    );
    lines.push(
        `- **Retailers with parent-corp NEID resolved**: ${fmtCount(retReport.resolved)} / ${fmtCount(retReport.total_retailers)} (${pct(retReport.resolved, retReport.total_retailers)}).`
    );
    if (retReport.unresolved.length) {
        lines.push(
            `  Unresolved retailers: ${retReport.unresolved.map((s) => `\`${s}\``).join(', ')}.`
        );
    }
    return lines.join('\n');
}

function buildByCountrySection(report: AreaReport): string {
    const lines: string[] = [];
    lines.push('## Area NEID resolution by country');
    lines.push('');
    lines.push('| Country | Areas | Resolved | Rate |');
    lines.push('| --- | ---: | ---: | ---: |');
    for (const [k, v] of Object.entries(report.by_country)) {
        lines.push(
            `| ${k} | ${fmtCount(v.total)} | ${fmtCount(v.resolved)} | ${pct(v.resolved, v.total)} |`
        );
    }
    return lines.join('\n');
}

function buildPhase0Section(probe: StoreProbeResult | null): string {
    const lines: string[] = [];
    lines.push('## Phase-0 store-NEID probe (PRD R5.1)');
    lines.push('');
    if (!probe) {
        lines.push('_No probe artifact found in `data/probes/`._');
        return lines.join('\n');
    }
    lines.push(
        `Latest run: ${probe.generated_at}; sample = ${probe.sample_per_retailer ?? '?'} stores per retailer.`
    );
    lines.push('');
    lines.push(
        `**Overall**: ${probe.overall.strict} strict / ${probe.overall.sample} (${pct(probe.overall.strict, probe.overall.sample)}); ${probe.overall.loose} loose (${pct(probe.overall.loose, probe.overall.sample)}).`
    );
    lines.push('');
    const decision =
        probe.overall.strict_rate >= 0.6
            ? 'GREEN — build store-level NEIDs for the full roster.'
            : probe.overall.strict_rate >= 0.3
              ? 'YELLOW — conditional click-targets; shopping-center fallback.'
              : 'RED — Phase 2 store-NEID resolution cancelled per PRD R5.1.';
    lines.push(`**Decision**: ${decision}`);
    lines.push('');
    lines.push('| Retailer | Sample | Strict | Loose | Strict % | Loose % |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const r of [...probe.results].sort((a, b) => b.strict_rate - a.strict_rate)) {
        lines.push(
            `| ${r.name} | ${r.sample_size} | ${r.strict_hits} | ${r.loose_hits} | ${pct(r.strict_hits, r.sample_size)} | ${pct(r.loose_hits, r.sample_size)} |`
        );
    }
    return lines.join('\n');
}

function buildKnownGapsSection(): string {
    return [
        '## Known gaps',
        '',
        "- **US area-NEID coverage at ~60%** — many small / rural counties don't resolve. The 1,239 unresolved US areas are mostly low-population counties; the populous CBSAs all resolve at score ≥ 0.99.",
        '- **CA province fallback** — 19 of the 139 Canadian areas are `province` flavor (not CMA), used for non-CMA Loblaw stores. None of the boundary topojson covers province polygons today, so those areas render as dots only.',
        '- **Article URL / publication date** — the Lovelace article schema does not carry a URL property and `published_at` is rarely populated. Tracked as R-008 in [`ROADMAP.md`](ROADMAP.md).',
        "- **R7.2 attribution** — most retailer-level events don't carry county-granularity participants, so the opens-vs-closes recipe is sparse but trustworthy. Description-text NER is gated on R-006.",
    ].join('\n');
}

function main(): void {
    const areaReport = readJSON<AreaReport>(AREAS_REPORT);
    const retReport = readJSON<RetailerReport>(RETAILERS_REPORT);
    if (!areaReport || !retReport) {
        throw new Error(
            'Missing report JSONs. Run `npm run expand:areas` and `npm run expand:retailers` first.'
        );
    }
    const areaCache = readJSON<Record<string, AreaCacheEntry>>(AREAS_CACHE) ?? {};
    const retailerCache = readJSON<Record<string, RetailerCacheEntry>>(RETAILERS_CACHE) ?? {};
    const retailers = readJSON<RetailerSummary[]>(RUNTIME_RETAILERS) ?? [];
    const areas = readJSON<AreaRecord[]>(RUNTIME_AREAS) ?? [];
    const storeProbe = latestStoreCoverage();

    const sections: string[] = [];
    sections.push(buildHeader(areaReport, retReport));
    sections.push('');
    sections.push(buildByCountrySection(areaReport));
    sections.push('');
    sections.push('## Per-retailer area resolution');
    sections.push('');
    sections.push(
        'For each retailer, the count of admin areas they operate in vs the subset of those areas with a resolved Elemental NEID. Drives the canvas halo coverage.'
    );
    sections.push('');
    sections.push(buildPerRetailerAreaTable(retailers, areas));
    sections.push('');
    sections.push('## Per-retailer parent-corp NEID');
    sections.push('');
    sections.push(
        'Used by the area-context fan-out to surface per-retailer corporate events when an active chip has a resolved NEID.'
    );
    sections.push('');
    sections.push(buildRetailerNeidTable(retailers, retailerCache));
    sections.push('');
    sections.push(buildPhase0Section(storeProbe));
    sections.push('');
    sections.push(buildKnownGapsSection());
    sections.push('');
    sections.push(
        `_Cache files: ${relative(ROOT, AREAS_CACHE)} (${Object.keys(areaCache).length} entries) · ${relative(ROOT, RETAILERS_CACHE)} (${Object.keys(retailerCache).length} entries)._`
    );
    sections.push('');

    const out = sections.join('\n');
    writeFileSync(OUT_PATH, out);
    console.log(`Wrote ${relative(ROOT, OUT_PATH)} (${out.length} chars)`);
}

main();
