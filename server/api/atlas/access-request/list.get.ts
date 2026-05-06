/**
 * GET /api/atlas/access-request/list — admin viewer for the R9.1 access
 * requests list. Auth + allowlist-gated like the rest of the atlas API.
 *
 * Returns the most recent N (default 200) entries, newest-first.
 */

import { assertAllowlistedUser } from '../../../utils/atlasAllowlist';
import { getRedis } from '../../../utils/redis';

const LIST_KEY = 'atlas:access-requests:v1';

interface StoredRecord {
    ts: string;
    email: string;
    name: string;
    company: string;
    note: string;
    source: string;
    ip: string | null;
}

interface ListResponse {
    enabled: boolean;
    count: number;
    items: StoredRecord[];
}

export default defineEventHandler(async (event): Promise<ListResponse> => {
    await assertAllowlistedUser(event);

    const query = getQuery(event);
    const limitRaw = Number(query.limit ?? 200);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 200;

    const redis = getRedis();
    if (!redis) {
        return { enabled: false, count: 0, items: [] };
    }
    const raw = (await redis.lrange(LIST_KEY, 0, limit - 1)) as Array<string | StoredRecord>;
    const items: StoredRecord[] = [];
    for (const r of raw) {
        if (!r) continue;
        if (typeof r === 'string') {
            try {
                items.push(JSON.parse(r) as StoredRecord);
            } catch {
                /* skip malformed */
            }
        } else if (typeof r === 'object') {
            items.push(r as StoredRecord);
        }
    }
    return { enabled: true, count: items.length, items };
});
