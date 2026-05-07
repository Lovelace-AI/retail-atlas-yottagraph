/**
 * R-014 — access-request email notification.
 *
 * Best-effort Resend delivery after an access request is persisted.
 * This helper is intentionally soft-fail: missing env or provider errors
 * should never break the user-facing submit flow.
 *
 * Required env:
 * - RESEND_API_KEY
 * - ATLAS_NOTIFY_EMAIL (destination mailbox, e.g. atlas-team@company.com)
 *
 * Optional env:
 * - ATLAS_NOTIFY_FROM (Resend-verified sender; default onboarding@resend.dev)
 */

import type { H3Event, EventHandlerRequest } from 'h3';

export interface AccessRequestRecord {
    ts: string;
    email: string;
    name: string;
    company: string;
    note: string;
    source: string;
    ip: string | null;
}

export interface NotifyResult {
    attempted: boolean;
    sent: boolean;
    reason?: string;
}

function env(name: string): string {
    return (process.env[name] ?? '').trim();
}

function subjectFor(rec: AccessRequestRecord): string {
    const company = rec.company ? ` @ ${rec.company}` : '';
    return `[Retail Atlas] Access request: ${rec.name}${company}`;
}

function textBody(rec: AccessRequestRecord): string {
    return [
        'New Retail Atlas access request',
        '',
        `When: ${rec.ts}`,
        `Name: ${rec.name}`,
        `Email: ${rec.email}`,
        `Company: ${rec.company || '(not provided)'}`,
        `Source: ${rec.source}`,
        `IP: ${rec.ip || '(unknown)'}`,
        '',
        'Note:',
        rec.note || '(none)',
    ].join('\n');
}

export async function notifyAccessRequest(
    _event: H3Event<EventHandlerRequest>,
    rec: AccessRequestRecord
): Promise<NotifyResult> {
    const apiKey = env('RESEND_API_KEY');
    const toEmail = env('ATLAS_NOTIFY_EMAIL');
    const fromEmail = env('ATLAS_NOTIFY_FROM') || 'Retail Atlas <onboarding@resend.dev>';

    if (!apiKey || !toEmail) {
        return { attempted: false, sent: false, reason: 'missing-env' };
    }

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: fromEmail,
                to: [toEmail],
                subject: subjectFor(rec),
                text: textBody(rec),
            }),
            signal: ctrl.signal,
        });
        if (!res.ok) {
            const msg = await res.text().catch(() => '');
            return {
                attempted: true,
                sent: false,
                reason: `resend-${res.status}${msg ? `:${msg.slice(0, 120)}` : ''}`,
            };
        }
        return { attempted: true, sent: true };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { attempted: true, sent: false, reason: msg.slice(0, 180) };
    } finally {
        clearTimeout(t);
    }
}
