/**
 * Server-side allowlist gate (PRD R9.1).
 *
 * Reads `ATLAS_ALLOWLIST` (comma-separated emails) from runtime config.
 * - When empty (dev / unset): no gate — every authed user passes.
 * - When set: the unsealed-cookie email must match (case-insensitive) one
 *   of the listed emails. Else 403.
 *
 * Compose with the existing Auth0 cookie unseal in `unsealCookie` —
 * unauthenticated callers fail at that step before ever reaching this one.
 */

import type { H3Event, EventHandlerRequest } from 'h3';

import { unsealCookie } from './cookies';

export interface AllowlistConfig {
    enabled: boolean;
    list: string[];
}

export function readAllowlist(event: H3Event<EventHandlerRequest>): AllowlistConfig {
    const cfg = useRuntimeConfig(event);
    const raw = (cfg.atlasAllowlist as string) || '';
    if (!raw.trim()) return { enabled: false, list: [] };
    const list = raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    return { enabled: list.length > 0, list };
}

interface AuthedUser {
    email?: string;
    name?: string;
    sub?: string;
}

export async function getAuthedUser(
    event: H3Event<EventHandlerRequest>
): Promise<AuthedUser | null> {
    try {
        const unsealed = (await unsealCookie(event)) as { user?: AuthedUser } | undefined;
        return unsealed?.user ?? null;
    } catch {
        return null;
    }
}

/**
 * Returns the authed user only if the allowlist passes. Throws 401 / 403
 * otherwise. Idempotent — safe to call multiple times per request.
 */
export async function assertAllowlistedUser(
    event: H3Event<EventHandlerRequest>
): Promise<AuthedUser> {
    const user = await getAuthedUser(event);
    if (!user || !user.sub) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthenticated' });
    }
    const { enabled, list } = readAllowlist(event);
    if (!enabled) return user;
    const email = (user.email ?? '').toLowerCase().trim();
    if (!email || !list.includes(email)) {
        throw createError({
            statusCode: 403,
            statusMessage: 'Atlas access pending — email not on the beta allowlist.',
        });
    }
    return user;
}
