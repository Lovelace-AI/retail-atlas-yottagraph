#!/usr/bin/env tsx
/**
 * Step 3a of the R7 plan — find the open/close categories Elemental
 * uses for retailer events.
 *
 * For each retailer org_neid in `data/neid_cache/retailer_neids.json`,
 * fetch up to 100 events via MCP and tally:
 *   1. Distinct category names (e.value of `properties.category`)
 *   2. Counts per category
 *   3. Open-keyword and close-keyword hits in `description.value`
 *   4. The intersection: categories whose name itself looks open- or
 *      close-shaped
 *
 * Outputs `data/probes/event-categories-{ts}.{json,md}` — committed for
 * provenance, then read by Step 3b to populate OPEN_CATEGORIES /
 * CLOSE_CATEGORIES in the opens-vs-closes endpoint.
 *
 * Run:
 *     npm run probe:event-categories
 *     RETAILERS=walmart,target,dollargeneral npm run probe:event-categories
 *     LIMIT=200 npm run probe:event-categories     # higher per-retailer cap
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type { RetailerSummary } from '../types/retail';

const ROOT = join(__dirname, '..');
const RETAILER_NEIDS = join(ROOT, 'data', 'neid_cache', 'retailer_neids.json');
const RETAILERS_JSON = join(ROOT, 'public', 'data', 'retail_atlas', 'retailers.json');
const OUT_DIR = join(ROOT, 'data', 'probes');

const PER_RETAILER_LIMIT = Number(process.env.LIMIT ?? 100);
const RETAILER_FILTER = (process.env.RETAILERS ?? '').split(',').filter(Boolean);

const OPEN_REGEX =
    /\b(open|opens|opened|opening|launch|launches|launched|launching|debut|debuted|new\s+location|new\s+store|grand\s+opening|reopen|reopens)\b/i;
const CLOSE_REGEX =
    /\b(close|closes|closed|closing|closure|shutter|shutters|liquidat|exit|exits|exited|wind\s+down|cease)\b/i;

interface RetailerNeidEntry {
    neid: string | null;
    name: string | null;
    score: number | null;
}

interface BroadchurchCfg {
    gatewayUrl: string;
    orgId: string;
}

function readBroadchurch(): BroadchurchCfg {
    const path = join(ROOT, 'broadchurch.yaml');
    if (!existsSync(path)) throw new Error('broadchurch.yaml missing');
    const yaml = readFileSync(path, 'utf-8');
    const grab = (key: string) => {
        const m = yaml.match(new RegExp(`^\\s*${key}:\\s*["']?([^"'\\n#]+)`, 'm'));
        return m ? m[1].trim() : '';
    };
    return {
        gatewayUrl: grab('url').replace(/\/$/, ''),
        orgId: grab('org_id'),
    };
}

interface MCPEvent {
    name?: string;
    neid?: string;
    properties?: {
        category?: { value?: string };
        description?: { value?: string };
        date?: { value?: string };
    };
}

interface MCPGetEventsResult {
    events?: MCPEvent[];
    total?: number;
}

interface RetailerProbe {
    slug: string;
    name: string;
    org_neid: string;
    n_events: number;
    n_total: number | undefined;
    categories: Record<string, number>;
    open_keyword_hits: number;
    close_keyword_hits: number;
    sample_open_descriptions: string[];
    sample_close_descriptions: string[];
}

async function probeRetailer(
    client: Client,
    slug: string,
    name: string,
    org_neid: string
): Promise<RetailerProbe> {
    const res = await client.callTool({
        name: 'elemental_get_events',
        arguments: { entity: org_neid, limit: PER_RETAILER_LIMIT },
    });
    const payload = (res.structuredContent ?? {}) as MCPGetEventsResult;
    const events = payload.events ?? [];

    const categories: Record<string, number> = {};
    let openHits = 0;
    let closeHits = 0;
    const sampleOpen: string[] = [];
    const sampleClose: string[] = [];

    for (const e of events) {
        const cat = e.properties?.category?.value ?? '(none)';
        categories[cat] = (categories[cat] ?? 0) + 1;
        const desc = e.properties?.description?.value ?? '';
        const text = `${e.name ?? ''} ${desc}`;
        if (OPEN_REGEX.test(text)) {
            openHits += 1;
            if (sampleOpen.length < 5) sampleOpen.push(desc.slice(0, 200));
        }
        if (CLOSE_REGEX.test(text)) {
            closeHits += 1;
            if (sampleClose.length < 5) sampleClose.push(desc.slice(0, 200));
        }
    }

    return {
        slug,
        name,
        org_neid,
        n_events: events.length,
        n_total: payload.total,
        categories,
        open_keyword_hits: openHits,
        close_keyword_hits: closeHits,
        sample_open_descriptions: sampleOpen,
        sample_close_descriptions: sampleClose,
    };
}

function categoryLooksOpen(name: string): boolean {
    return OPEN_REGEX.test(name);
}
function categoryLooksClose(name: string): boolean {
    return CLOSE_REGEX.test(name);
}

interface AggregateReport {
    generated_at: string;
    per_retailer_limit: number;
    retailers_probed: number;
    union_categories: Array<{
        name: string;
        total: number;
        retailers: number;
        looks_open: boolean;
        looks_close: boolean;
    }>;
    per_retailer: RetailerProbe[];
    summary: {
        total_events: number;
        open_keyword_total: number;
        close_keyword_total: number;
        likely_open_categories: string[];
        likely_close_categories: string[];
    };
}

function buildAggregate(probes: RetailerProbe[]): AggregateReport {
    const union = new Map<string, { total: number; retailers: number }>();
    for (const p of probes) {
        for (const [cat, n] of Object.entries(p.categories)) {
            const cur = union.get(cat);
            if (cur) {
                cur.total += n;
                cur.retailers += 1;
            } else {
                union.set(cat, { total: n, retailers: 1 });
            }
        }
    }
    const unionList = [...union.entries()]
        .map(([name, v]) => ({
            name,
            total: v.total,
            retailers: v.retailers,
            looks_open: categoryLooksOpen(name),
            looks_close: categoryLooksClose(name),
        }))
        .sort((a, b) => b.total - a.total);

    return {
        generated_at: new Date().toISOString(),
        per_retailer_limit: PER_RETAILER_LIMIT,
        retailers_probed: probes.length,
        union_categories: unionList,
        per_retailer: probes,
        summary: {
            total_events: probes.reduce((n, p) => n + p.n_events, 0),
            open_keyword_total: probes.reduce((n, p) => n + p.open_keyword_hits, 0),
            close_keyword_total: probes.reduce((n, p) => n + p.close_keyword_hits, 0),
            likely_open_categories: unionList.filter((c) => c.looks_open).map((c) => c.name),
            likely_close_categories: unionList.filter((c) => c.looks_close).map((c) => c.name),
        },
    };
}

function writeMarkdown(path: string, report: AggregateReport): void {
    const lines: string[] = [];
    lines.push(`# Event categories probe (R7.2 step 3a)`);
    lines.push('');
    lines.push(`Generated: ${report.generated_at}`);
    lines.push(`Per-retailer limit: ${report.per_retailer_limit}`);
    lines.push(`Retailers probed: ${report.retailers_probed}`);
    lines.push(`Total events sampled: ${report.summary.total_events}`);
    lines.push('');
    lines.push(`## Likely open categories (regex match on category name)`);
    lines.push('');
    if (report.summary.likely_open_categories.length) {
        for (const c of report.summary.likely_open_categories) lines.push(`- \`${c}\``);
    } else {
        lines.push(`_(none)_`);
    }
    lines.push('');
    lines.push(`## Likely close categories`);
    lines.push('');
    if (report.summary.likely_close_categories.length) {
        for (const c of report.summary.likely_close_categories) lines.push(`- \`${c}\``);
    } else {
        lines.push(`_(none)_`);
    }
    lines.push('');
    lines.push(`## Keyword fallback signal`);
    lines.push('');
    lines.push(
        `- Open-keyword hits across all retailers: **${report.summary.open_keyword_total} / ${report.summary.total_events}**`
    );
    lines.push(
        `- Close-keyword hits across all retailers: **${report.summary.close_keyword_total} / ${report.summary.total_events}**`
    );
    lines.push('');
    lines.push(`## Union of categories (sorted by total events)`);
    lines.push('');
    lines.push(`| Category | Total | Retailers | Open? | Close? |`);
    lines.push(`| --- | ---: | ---: | :-: | :-: |`);
    for (const c of report.union_categories) {
        lines.push(
            `| ${c.name} | ${c.total} | ${c.retailers} | ${c.looks_open ? '✓' : ''} | ${c.looks_close ? '✓' : ''} |`
        );
    }
    lines.push('');
    lines.push(`## Per-retailer breakdown`);
    lines.push('');
    for (const p of report.per_retailer) {
        lines.push(`### ${p.name} (${p.slug})`);
        lines.push(`- org_neid: \`${p.org_neid}\``);
        lines.push(`- events sampled: ${p.n_events} (server total: ${p.n_total ?? '?'})`);
        lines.push(`- open keyword hits: ${p.open_keyword_hits}`);
        lines.push(`- close keyword hits: ${p.close_keyword_hits}`);
        if (Object.keys(p.categories).length > 0) {
            lines.push(`- categories:`);
            const sorted = [...Object.entries(p.categories)].sort((a, b) => b[1] - a[1]);
            for (const [cat, n] of sorted) lines.push(`  - ${n} ${cat}`);
        }
        if (p.sample_open_descriptions.length) {
            lines.push(`- sample open keyword descriptions:`);
            for (const s of p.sample_open_descriptions) lines.push(`  - ${s}`);
        }
        if (p.sample_close_descriptions.length) {
            lines.push(`- sample close keyword descriptions:`);
            for (const s of p.sample_close_descriptions) lines.push(`  - ${s}`);
        }
        lines.push('');
    }
    writeFileSync(path, lines.join('\n') + '\n');
}

async function main(): Promise<void> {
    const cfg = readBroadchurch();
    if (!existsSync(RETAILER_NEIDS)) {
        throw new Error('retailer_neids.json missing — run npm run expand:retailers first');
    }
    const cache = JSON.parse(readFileSync(RETAILER_NEIDS, 'utf-8')) as Record<
        string,
        RetailerNeidEntry
    >;
    const retailers = existsSync(RETAILERS_JSON)
        ? (JSON.parse(readFileSync(RETAILERS_JSON, 'utf-8')) as RetailerSummary[])
        : [];
    const nameOf = (slug: string) => retailers.find((r) => r.slug === slug)?.name ?? slug;

    const filter = new Set(RETAILER_FILTER);
    const slugs = Object.keys(cache).filter(
        (slug) => cache[slug]?.neid && (filter.size === 0 || filter.has(slug))
    );

    if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

    console.log(`probe-event-categories`);
    console.log(`  retailers to probe: ${slugs.length}`);
    console.log(`  per-retailer event cap: ${PER_RETAILER_LIMIT}`);
    console.log('');

    const url = new URL(`${cfg.gatewayUrl}/api/mcp/${cfg.orgId}/elemental/mcp`);
    const transport = new StreamableHTTPClientTransport(url);
    const client = new Client(
        { name: 'retail-atlas-probe', version: '1.0.0' },
        { capabilities: {} }
    );
    await client.connect(transport);

    const probes: RetailerProbe[] = [];
    try {
        for (const slug of slugs) {
            const entry = cache[slug];
            if (!entry?.neid) continue;
            try {
                const p = await probeRetailer(client, slug, nameOf(slug), entry.neid);
                probes.push(p);
                const cats = Object.keys(p.categories).length;
                console.log(
                    `  ${slug.padEnd(18)} events=${String(p.n_events).padStart(4)}  cats=${String(cats).padStart(3)}  open_kw=${String(p.open_keyword_hits).padStart(3)}  close_kw=${String(p.close_keyword_hits).padStart(3)}`
                );
            } catch (err) {
                console.warn(`  ${slug}: error ${(err as Error).message}`);
            }
        }
    } finally {
        await client.close();
    }

    const report = buildAggregate(probes);

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonPath = join(OUT_DIR, `event-categories-${ts}.json`);
    const mdPath = join(OUT_DIR, `event-categories-${ts}.md`);
    if (!existsSync(dirname(jsonPath))) mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    writeMarkdown(mdPath, report);

    console.log('');
    console.log(`Done. ${probes.length} retailers probed.`);
    console.log(`Total events sampled: ${report.summary.total_events}`);
    console.log(
        `Open-shaped categories: ${report.summary.likely_open_categories.length || 0} — ${report.summary.likely_open_categories.join(', ') || '(none)'}`
    );
    console.log(
        `Close-shaped categories: ${report.summary.likely_close_categories.length || 0} — ${report.summary.likely_close_categories.join(', ') || '(none)'}`
    );
    console.log(
        `Keyword fallback: open ${report.summary.open_keyword_total}, close ${report.summary.close_keyword_total}`
    );
    console.log('');
    console.log(`Wrote ${relative(ROOT, jsonPath)}`);
    console.log(`Wrote ${relative(ROOT, mdPath)}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
