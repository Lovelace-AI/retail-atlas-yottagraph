/**
 * Live context fan-out for a pinned area or store.
 *
 * Calls Elemental via the gateway helpers in `utils/elementalHelpers` to
 * resolve events, articles, and economic concepts for the entity's NEID.
 * Per R6.3, results are cached in-memory for the session keyed by
 * `{neid}:{retailers_hash}` (the retailer set is mixed into the key because
 * the retailer-events block depends on it).
 */

import { buildGatewayUrl, getApiKey, padNeid } from '~/utils/elementalHelpers';

export interface ContextEvent {
    neid: string;
    name: string;
    summary?: string | null;
    timestamp?: string | null;
}

export interface ContextArticle {
    neid: string;
    name: string;
    sentiment?: number | null;
    timestamp?: string | null;
}

export interface ContextConcept {
    neid: string;
    name: string;
}

export interface ContextProvenance {
    tool: string;
    duration_ms: number;
    ok: boolean;
    cached: boolean;
}

export interface AtlasContextResult {
    neid: string;
    flavor: 'location' | 'organization';
    events: ContextEvent[];
    articles: ContextArticle[];
    concepts: ContextConcept[];
    provenance: ContextProvenance[];
    error: string | null;
    cached: boolean;
}

const _cache = new Map<string, AtlasContextResult>();
const _inflight = new Map<string, Promise<AtlasContextResult>>();

function cacheKey(neid: string, retailers: string[]): string {
    const hash = [...retailers].sort().join(',');
    return `${neid}:${hash}`;
}

async function callRelated(
    neid: string,
    relatedFlavor: string,
    limit: number
): Promise<{ neids: string[]; durationMs: number; ok: boolean }> {
    const start = performance.now();
    try {
        const url = buildGatewayUrl(
            `entities/${padNeid(neid)}/related?related_flavor=${encodeURIComponent(
                relatedFlavor
            )}&limit=${limit}`
        );
        const res = await $fetch<any>(url, { headers: { 'X-Api-Key': getApiKey() } });
        const neids: string[] = (res?.neids ?? res?.eids ?? res?.related ?? []).map((v: any) =>
            padNeid(typeof v === 'string' ? v : (v.neid ?? v.eid ?? ''))
        );
        return { neids, durationMs: Math.round(performance.now() - start), ok: true };
    } catch (e) {
        return { neids: [], durationMs: Math.round(performance.now() - start), ok: false };
    }
}

async function callName(neid: string): Promise<string> {
    try {
        const url = buildGatewayUrl(`entities/${padNeid(neid)}/name`);
        const res = await $fetch<{ name: string }>(url, {
            headers: { 'X-Api-Key': getApiKey() },
        });
        return res?.name || padNeid(neid);
    } catch {
        return padNeid(neid);
    }
}

export function useAtlasContext() {
    async function resolve(
        neid: string,
        flavor: 'location' | 'organization',
        retailers: string[] = []
    ): Promise<AtlasContextResult> {
        const padded = padNeid(neid);
        const key = cacheKey(padded, retailers);
        const cached = _cache.get(key);
        if (cached) return { ...cached, cached: true };

        const existing = _inflight.get(key);
        if (existing) return existing;

        const p = (async (): Promise<AtlasContextResult> => {
            const provenance: ContextProvenance[] = [];
            let lastError: string | null = null;

            const [eventsResult, articlesResult, conceptsResult] = await Promise.all([
                callRelated(padded, 'event', 12),
                callRelated(padded, 'article', 12),
                callRelated(padded, 'economic_concept', 8),
            ]);

            provenance.push({
                tool: 'elemental_get_related(event)',
                duration_ms: eventsResult.durationMs,
                ok: eventsResult.ok,
                cached: false,
            });
            provenance.push({
                tool: 'elemental_get_related(article)',
                duration_ms: articlesResult.durationMs,
                ok: articlesResult.ok,
                cached: false,
            });
            provenance.push({
                tool: 'elemental_get_related(economic_concept)',
                duration_ms: conceptsResult.durationMs,
                ok: conceptsResult.ok,
                cached: false,
            });

            if (!eventsResult.ok && !articlesResult.ok && !conceptsResult.ok) {
                lastError =
                    'Elemental gateway returned no data — verify network access and X-Api-Key.';
            }

            const allNeids = [
                ...eventsResult.neids,
                ...articlesResult.neids,
                ...conceptsResult.neids,
            ];

            const nameStart = performance.now();
            const nameMap = new Map<string, string>();
            await Promise.all(
                allNeids.map(async (n) => {
                    nameMap.set(n, await callName(n));
                })
            );
            provenance.push({
                tool: 'entities/{neid}/name',
                duration_ms: Math.round(performance.now() - nameStart),
                ok: true,
                cached: false,
            });

            const result: AtlasContextResult = {
                neid: padded,
                flavor,
                events: eventsResult.neids.map((n) => ({ neid: n, name: nameMap.get(n) ?? n })),
                articles: articlesResult.neids.map((n) => ({
                    neid: n,
                    name: nameMap.get(n) ?? n,
                })),
                concepts: conceptsResult.neids.map((n) => ({
                    neid: n,
                    name: nameMap.get(n) ?? n,
                })),
                provenance,
                error: lastError,
                cached: false,
            };

            _cache.set(key, result);
            return result;
        })();

        _inflight.set(key, p);
        try {
            return await p;
        } finally {
            _inflight.delete(key);
        }
    }

    function cacheStats() {
        return {
            entries: _cache.size,
        };
    }

    return { resolve, cacheStats };
}
