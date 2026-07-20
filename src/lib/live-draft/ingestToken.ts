/**
 * Per-user ingest token for /api/live-draft-ingest.
 *
 * Token format: base64url(userId) + '.' + secret. The secret (32 random
 * bytes, base64url) is stored in user_settings (type 'app', key
 * 'liveDraftIngest'); the route splits the token, loads that user's stored
 * secret with the service client, and constant-time compares (see route.ts —
 * the compare is Node-only and deliberately not in this isomorphic module).
 *
 * The token is pasted into localStorage on fantasy.espn.com for the tap
 * userscript, where ESPN's own page scripts could read it — its blast radius
 * is intentionally tiny (it can only insert raw frames as that user), and the
 * UI recommends regenerating after each draft.
 */

export const INGEST_SETTING_TYPE = 'app' as const;
export const INGEST_SETTING_KEY = 'liveDraftIngest';

export interface IngestSettingData {
    secret: string;
    createdAt: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_RE = /^[A-Za-z0-9_-]{20,64}$/;

function toBase64Url(s: string): string {
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string | null {
    try {
        const padded = s.replace(/-/g, '+').replace(/_/g, '/');
        return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    } catch {
        return null;
    }
}

/** Generate a fresh 32-byte base64url secret (browser or Node). */
export function mintIngestSecret(): string {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return toBase64Url(String.fromCharCode(...bytes));
}

export function formatIngestToken(userId: string, secret: string): string {
    return `${toBase64Url(userId)}.${secret}`;
}

/** Split and decode a bearer token; null on any malformation. */
export function parseIngestToken(token: string): { userId: string; secret: string } | null {
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    const userId = fromBase64Url(token.slice(0, dot));
    const secret = token.slice(dot + 1);
    if (!userId || !UUID_RE.test(userId) || !SECRET_RE.test(secret)) return null;
    return { userId: userId.toLowerCase(), secret };
}
