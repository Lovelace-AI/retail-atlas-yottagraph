import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/**
 * Per-request MCP session wrapper for the lovelace-elemental server.
 *
 * The Lovelace gateway exposes the MCP server at
 *   {gatewayUrl}/api/mcp/{tenantOrgId}/elemental/mcp
 * via the standard Streamable-HTTP transport (protocol version 2025-03-26).
 * Auth is proxied at the gateway, so we don't need a per-user token here.
 *
 * Usage from a Nitro route:
 *
 *   import { withElementalMcp } from '~/server/utils/elementalMcp';
 *   const result = await withElementalMcp(async (client) => {
 *     return await client.callTool({
 *       name: 'elemental_get_events',
 *       arguments: { entity: areaNeid, limit: 12 },
 *     });
 *   });
 *
 * Sessions are opened and closed per-request (per the plan). If panel-open
 * latency becomes a UX problem, swap this for a module-cached client.
 */

interface GatewayConfig {
    gatewayUrl: string;
    tenantOrgId: string;
}

function readGatewayConfig(): GatewayConfig {
    const cfg = useRuntimeConfig();
    const gatewayUrl = (cfg.public.gatewayUrl as string) || '';
    const tenantOrgId = (cfg.public.tenantOrgId as string) || '';
    if (!gatewayUrl || !tenantOrgId) {
        throw createError({
            statusCode: 500,
            statusMessage:
                'Elemental MCP: gateway credentials missing (NUXT_PUBLIC_GATEWAY_URL / NUXT_PUBLIC_TENANT_ORG_ID).',
        });
    }
    return { gatewayUrl: gatewayUrl.replace(/\/$/, ''), tenantOrgId };
}

export async function withElementalMcp<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const cfg = readGatewayConfig();
    const url = new URL(`${cfg.gatewayUrl}/api/mcp/${cfg.tenantOrgId}/elemental/mcp`);

    const transport = new StreamableHTTPClientTransport(url);
    const client = new Client({ name: 'retail-atlas', version: '1.0.0' }, { capabilities: {} });

    await client.connect(transport);
    try {
        return await fn(client);
    } finally {
        // close() sends DELETE to terminate the session and tears down the SSE stream.
        try {
            await client.close();
        } catch {
            // best-effort — server may have already closed the session
        }
    }
}

/**
 * Helper: extract the structured tool result from an MCP `callTool` response.
 *
 * The MCP spec returns both human-readable `content` and machine-readable
 * `structuredContent`. Lovelace's tools always populate `structuredContent`
 * with the actual response payload; falling back to JSON-parsing the first
 * text block keeps us defensive against any future tool that doesn't.
 */
export function unwrapToolResult<T = Record<string, unknown>>(
    res: Awaited<ReturnType<Client['callTool']>>
): T {
    const structured = (res as { structuredContent?: unknown }).structuredContent;
    if (structured && typeof structured === 'object') {
        return structured as T;
    }
    const content = (res as { content?: Array<{ type: string; text?: string }> }).content;
    if (content && content.length > 0) {
        const first = content[0];
        if (first.type === 'text' && typeof first.text === 'string') {
            try {
                return JSON.parse(first.text) as T;
            } catch {
                // fall through
            }
        }
    }
    return {} as T;
}
