/**
 * POST /api/db/atlas-setup
 *
 * R-015 Phase A: initialize Neon tables for the Atlas substrate.
 * Auth-gated by the existing allowlist middleware pattern.
 */

import { assertAllowlistedUser } from '../../utils/atlasAllowlist';
import { ensureAtlasTablesOnce, isDbConfigured } from '../../utils/neon';

export default defineEventHandler(async (event) => {
    await assertAllowlistedUser(event);

    if (!isDbConfigured()) {
        throw createError({
            statusCode: 503,
            statusMessage: 'Neon is not configured (DATABASE_URL missing).',
        });
    }

    await ensureAtlasTablesOnce();
    return {
        ok: true,
        initialized: true,
    };
});
