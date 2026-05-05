/**
 * POST /api/atlas/area-context — fans out a clicked area's NEID into the
 * Lovelace knowledge graph and returns the data the AtlasContextPanel
 * renders.
 *
 * Request body:
 *   {
 *     area_neid: string,            // 20-char zero-padded NEID
 *     area_key:  string,            // for caching / telemetry
 *     retailers: string[]           // active retailer slugs (per chip set)
 *   }
 *
 * Response body:
 *   {
 *     area_events:        ContextEvent[],
 *     area_articles:      ContextArticle[],
 *     economic_concepts:  ContextConcept[],
 *     retailer_events:    Record<string, ContextEvent[]>,
 *     elapsed_ms:         number,
 *     tool_calls:         { tool: string; ms: number; ok: boolean }[],
 *   }
 *
 * Implementation notes:
 *   - Calls go through the gateway proxy (`X-Api-Key` from runtimeConfig)
 *     so we don't need a per-user Auth0 token here.
 *   - Articles + economic concepts are fetched via `/elemental/find` with
 *     a `linked` expression (graph-layer traversal). Article display data
 *     comes from `/elemental/entities/properties` for PIDs 8 (name),
 *     115 (title), 132 (homeUrl), 146 (date).
 *   - Events are not exposed via REST; the MCP tool `elemental_get_events`
 *     is the canonical surface. Until we wire the MCP path through Nitro,
 *     events return [] and the panel renders an "Events require MCP"
 *     placeholder. The endpoint shape is final, only the implementation is
 *     stubbed.
 *   - Retailer-events similarly require per-retailer org NEIDs which we
 *     don't currently track. They'll graduate when the registry gains a
 *     `cik` or `org_neid` field per retailer.
 */

interface ContextEvent {
    neid: string;
    summary: string;
    ts?: string | null;
    kind?: string | null;
}

interface ContextArticle {
    neid: string;
    title: string;
    publisher?: string | null;
    published_at?: string | null;
    url?: string | null;
}

interface ContextConcept {
    neid: string;
    name: string;
}

interface ToolCall {
    tool: string;
    ms: number;
    ok: boolean;
}

interface AreaContextRequest {
    area_neid: string;
    area_key: string;
    retailers: string[];
}

interface AreaContextResponse {
    area_events: ContextEvent[];
    area_articles: ContextArticle[];
    economic_concepts: ContextConcept[];
    retailer_events: Record<string, ContextEvent[]>;
    elapsed_ms: number;
    tool_calls: ToolCall[];
}

interface FindResponse {
    op_id?: string;
    eids?: string[];
}

interface PropertiesResponse {
    op_id?: string;
    values?: Array<{
        eid: string;
        pid: string | number;
        value: unknown;
        recorded_at?: string;
    }>;
}

const FID_ARTICLE = 12;
const FID_ECONOMIC_CONCEPT = 18;

// Property IDs (small integers — safe to use as JS numbers).
const PID_NAME = 8;
const PID_TITLE = 115;
const PID_HOME_URL = 132;
const PID_DATE = 146;

const ARTICLE_LIMIT = 12;
const CONCEPT_LIMIT = 8;

function gatewayBase() {
    const cfg = useRuntimeConfig();
    const gw = (cfg.public.gatewayUrl as string) || '';
    const org = (cfg.public.tenantOrgId as string) || '';
    const key = (cfg.public.qsApiKey as string) || '';
    if (!gw || !org || !key) {
        throw createError({
            statusCode: 500,
            statusMessage:
                'Atlas area-context: gateway credentials missing (NUXT_PUBLIC_GATEWAY_URL / TENANT_ORG_ID / QS_API_KEY).',
        });
    }
    return {
        url: gw.replace(/\/$/, ''),
        org,
        key,
    };
}

async function elementalFindLinked(
    gw: { url: string; org: string; key: string },
    fid: number,
    targetNeid: string,
    limit: number
): Promise<string[]> {
    const expression = JSON.stringify({
        type: 'and',
        and: [
            { type: 'is_type', is_type: { fid } },
            { type: 'linked', linked: { to_entity: targetNeid, distance: 1 } },
        ],
    });
    const body = new URLSearchParams();
    body.set('expression', expression);
    body.set('limit', String(limit));

    const res = await $fetch<FindResponse>(`${gw.url}/api/qs/${gw.org}/elemental/find`, {
        method: 'POST',
        headers: {
            'X-Api-Key': gw.key,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    });
    return res.eids ?? [];
}

async function elementalProperties(
    gw: { url: string; org: string; key: string },
    eids: string[],
    pids: number[]
): Promise<PropertiesResponse> {
    if (eids.length === 0) return { values: [] };
    const body = new URLSearchParams();
    body.set('eids', JSON.stringify(eids));
    body.set('pids', JSON.stringify(pids));
    return await $fetch<PropertiesResponse>(
        `${gw.url}/api/qs/${gw.org}/elemental/entities/properties`,
        {
            method: 'POST',
            headers: {
                'X-Api-Key': gw.key,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: body.toString(),
        }
    );
}

async function batchEntityNames(
    gw: { url: string; org: string; key: string },
    neids: string[]
): Promise<Record<string, string>> {
    if (neids.length === 0) return {};
    const res = await $fetch<{ results?: Record<string, string> }>(
        `${gw.url}/api/qs/${gw.org}/entities/names`,
        {
            method: 'POST',
            headers: { 'X-Api-Key': gw.key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ neids }),
        }
    );
    return res.results ?? {};
}

async function tracedCall<T>(
    label: string,
    fn: () => Promise<T>,
    tool_calls: ToolCall[]
): Promise<T | null> {
    const t0 = Date.now();
    try {
        const v = await fn();
        tool_calls.push({ tool: label, ms: Date.now() - t0, ok: true });
        return v;
    } catch (err) {
        console.warn(`[atlas-area-context] ${label} failed: ${(err as Error).message}`);
        tool_calls.push({ tool: label, ms: Date.now() - t0, ok: false });
        return null;
    }
}

export default defineEventHandler(async (event): Promise<AreaContextResponse> => {
    const body = (await readBody(event)) as AreaContextRequest;
    if (!body || !body.area_neid) {
        throw createError({
            statusCode: 400,
            statusMessage: 'area_neid required',
        });
    }

    const gw = gatewayBase();
    const tool_calls: ToolCall[] = [];
    const t0 = Date.now();

    const [articleEids, conceptEids] = await Promise.all([
        tracedCall(
            'find:articles',
            () => elementalFindLinked(gw, FID_ARTICLE, body.area_neid, ARTICLE_LIMIT),
            tool_calls
        ),
        tracedCall(
            'find:economic_concepts',
            () => elementalFindLinked(gw, FID_ECONOMIC_CONCEPT, body.area_neid, CONCEPT_LIMIT),
            tool_calls
        ),
    ]);

    const articles: ContextArticle[] = [];
    if (articleEids && articleEids.length > 0) {
        const props = await tracedCall(
            'properties:articles',
            () =>
                elementalProperties(gw, articleEids, [PID_NAME, PID_TITLE, PID_HOME_URL, PID_DATE]),
            tool_calls
        );
        const byEid: Record<
            string,
            { name?: string; title?: string; url?: string; date?: string }
        > = {};
        for (const v of props?.values ?? []) {
            const eid = String(v.eid);
            byEid[eid] ??= {};
            const pid = Number(v.pid);
            const value = v.value === null || v.value === undefined ? '' : String(v.value);
            if (pid === PID_NAME) byEid[eid].name = value;
            else if (pid === PID_TITLE) byEid[eid].title = value;
            else if (pid === PID_HOME_URL) byEid[eid].url = value;
            else if (pid === PID_DATE) byEid[eid].date = value;
        }
        for (const eid of articleEids) {
            const p = byEid[eid] ?? {};
            articles.push({
                neid: eid,
                title: p.title || p.name || `(article ${eid.slice(0, 8)}…)`,
                publisher: null,
                published_at: p.date ?? null,
                url: p.url ?? null,
            });
        }
    }

    const concepts: ContextConcept[] = [];
    if (conceptEids && conceptEids.length > 0) {
        const names = await tracedCall(
            'names:concepts',
            () => batchEntityNames(gw, conceptEids),
            tool_calls
        );
        for (const eid of conceptEids) {
            concepts.push({
                neid: eid,
                name: names?.[eid] ?? `(concept ${eid.slice(0, 8)}…)`,
            });
        }
    }

    return {
        area_events: [],
        area_articles: articles,
        economic_concepts: concepts,
        retailer_events: {},
        elapsed_ms: Date.now() - t0,
        tool_calls,
    };
});
