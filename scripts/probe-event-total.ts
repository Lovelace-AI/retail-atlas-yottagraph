#!/usr/bin/env tsx
/**
 * R-009 probe — does `elemental_get_events` return a `total` that's
 * independent of `limit`?
 *
 * If yes, the event-density recipe can drop limit to 1 and rely on
 * `total` for the count, removing the per-area cap entirely.
 *
 * Run: `npm run probe:event-total`
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import type { AreaRecord } from '../types/retail';

const ROOT = join(__dirname, '..');

interface BroadchurchCfg {
    gatewayUrl: string;
    orgId: string;
}

function readBroadchurch(): BroadchurchCfg {
    const path = join(ROOT, 'broadchurch.yaml');
    if (!existsSync(path)) throw new Error('broadchurch.yaml missing');
    const yaml = readFileSync(path, 'utf-8');
    const grab = (key: string) => {
        const m = yaml.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
        return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
    };
    return {
        gatewayUrl: grab('url'),
        orgId: grab('org_id'),
    };
}

async function unwrap<T>(res: Awaited<ReturnType<Client['callTool']>>): Promise<T> {
    const structured = (res as { structuredContent?: unknown }).structuredContent;
    if (structured && typeof structured === 'object') return structured as T;
    const content = (res as { content?: Array<{ type: string; text?: string }> }).content;
    if (content?.length && content[0].type === 'text' && content[0].text) {
        try {
            return JSON.parse(content[0].text) as T;
        } catch {
            /* fall through */
        }
    }
    return {} as T;
}

interface EventResult {
    total?: number;
    events?: unknown[];
}

async function main(): Promise<void> {
    const cfg = readBroadchurch();
    if (!cfg.gatewayUrl || !cfg.orgId) {
        throw new Error('broadchurch.yaml missing gateway url / org_id');
    }
    const url = new URL(`${cfg.gatewayUrl}/api/mcp/${cfg.orgId}/elemental/mcp`);

    // Pick three high-store-count US area NEIDs from the runtime areas.
    const areasPath = join(ROOT, 'public', 'data', 'retail_atlas', 'areas.json');
    const areas = JSON.parse(readFileSync(areasPath, 'utf-8')) as AreaRecord[];
    const probes = areas
        .filter((a) => a.country === 'US' && !!a.neid)
        .sort((x, y) => y.total_stores - x.total_stores)
        .slice(0, 3);

    const limits = [1, 5, 50, 200];

    const transport = new StreamableHTTPClientTransport(url);
    const client = new Client(
        { name: 'retail-atlas-probe', version: '1.0.0' },
        { capabilities: {} }
    );
    await client.connect(transport);

    try {
        for (const a of probes) {
            console.log(`\n--- ${a.area_key} (${a.area_name}, total_stores=${a.total_stores}) ---`);
            console.log(`limit  total  events.length  ms`);
            for (const limit of limits) {
                const t0 = Date.now();
                const res = await client.callTool({
                    name: 'elemental_get_events',
                    arguments: { entity: a.neid as string, limit },
                });
                const ms = Date.now() - t0;
                if (res.isError) {
                    console.log(`${String(limit).padEnd(5)}  ERROR (${ms}ms)`);
                    continue;
                }
                const r = await unwrap<EventResult>(res);
                console.log(
                    `${String(limit).padEnd(5)}  ${String(r.total ?? '?').padEnd(5)}  ${String(
                        r.events?.length ?? 0
                    ).padEnd(13)}  ${ms}`
                );
            }
        }
    } finally {
        try {
            await client.close();
        } catch {
            /* ignore */
        }
    }
}

void main().catch((err) => {
    console.error(err);
    process.exit(1);
});
