/**
 * POST /api/atlas/access-request — PRD R9.1.
 *
 * Anonymous form submission from the marketing splash. Stores
 * `{ email, name, company, note, ts, source }` to a 1k-cap Upstash list
 * `atlas:access-requests:v1`. Reading is admin-only via the companion
 * GET endpoint.
 *
 * R-014: after successful persist, this route also sends a best-effort
 * notification email via Resend when `RESEND_API_KEY` and
 * `ATLAS_NOTIFY_EMAIL` are configured.
 *
 * If KV isn't configured, returns success but logs a warning so local dev
 * doesn't break.
 */

import { notifyAccessRequest, type AccessRequestRecord } from '../../utils/accessRequestNotify';
import { getRedis } from '../../utils/redis';

const LIST_KEY = 'atlas:access-requests:v1';
const MAX_LEN = 1000;

interface AccessRequestBody {
    email?: string;
    name?: string;
    company?: string;
    note?: string;
    source?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default defineEventHandler(async (event) => {
    const body = (await readBody(event)) as AccessRequestBody | null;
    if (!body) {
        throw createError({ statusCode: 400, statusMessage: 'Body required' });
    }
    const email = (body.email ?? '').trim().toLowerCase();
    const name = (body.name ?? '').trim().slice(0, 200);
    const company = (body.company ?? '').trim().slice(0, 200);
    const note = (body.note ?? '').trim().slice(0, 1000);
    const source = (body.source ?? 'welcome').slice(0, 60);

    if (!email || !EMAIL_RE.test(email)) {
        throw createError({ statusCode: 400, statusMessage: 'Valid email required' });
    }
    if (!name) {
        throw createError({ statusCode: 400, statusMessage: 'Name required' });
    }

    const xff = getRequestHeader(event, 'x-forwarded-for') ?? '';
    const ip = xff.split(',')[0].trim() || null;

    const record: AccessRequestRecord = {
        ts: new Date().toISOString(),
        email,
        name,
        company,
        note,
        source,
        ip,
    };

    const redis = getRedis();
    if (!redis) {
        console.warn(
            '[access-request] KV not configured (KV_REST_API_URL/_TOKEN missing); request not persisted'
        );
        return { ok: true, persisted: false, notified: false };
    }
    try {
        await redis.lpush(LIST_KEY, JSON.stringify(record));
        await redis.ltrim(LIST_KEY, 0, MAX_LEN - 1);
        const notified = await notifyAccessRequest(event, record);
        if (!notified.sent && notified.attempted) {
            console.warn(`[access-request] notify failed: ${notified.reason ?? 'unknown'}`);
        }
        return { ok: true, persisted: true, notified: notified.sent };
    } catch (err) {
        console.error('[access-request] persist failed', err);
        return { ok: true, persisted: false, notified: false };
    }
});
