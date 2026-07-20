/**
 * Live-Draft Ingest Integration Tests
 *
 * Exercises the real /api/live-draft-ingest route handlers against local
 * Supabase (migration 007): token verification against a real user_settings
 * row, actual dedupe of retried batches via the unique constraint, RLS
 * isolation between users, and the deliberate absence of an authenticated
 * INSERT path. These are the behaviors the mocked unit tests cannot see —
 * the schema-level failure class (grants, RLS, missing tables) that has
 * bitten production before.
 *
 * Setup:
 * - Local Supabase running (localhost:54321) with migrations applied
 * - NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 *   SUPABASE_SERVICE_ROLE_KEY (loaded from .env.test.local / .env.local)
 *
 * Run with: npm run test:integration
 */

import { config as loadEnv } from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { formatIngestToken, mintIngestSecret, INGEST_SETTING_KEY, INGEST_SETTING_TYPE } from '@/lib/live-draft/ingestToken';
import type { Database } from '@/lib/database.types';

// The shared integration setup mocks NextResponse as a json-only stub; this
// route constructs NextResponse directly, so back it with the real Response.
jest.mock('next/server', () => ({
    NextResponse: class NextResponseMock extends Response {
        static json(data: unknown, init?: ResponseInit) {
            return new NextResponseMock(JSON.stringify(data), init);
        }
    },
}));

// Integration jest config does not auto-load env files.
loadEnv({ path: '.env.test.local' });
loadEnv({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_AVAILABLE = !!(SUPABASE_URL?.includes('localhost:54321') && ANON_KEY && SERVICE_ROLE_KEY);

const ESPN_ORIGIN = 'https://fantasy.espn.com';
const LEAGUE_ID = '999000111';

const maybeDescribe = SUPABASE_AVAILABLE ? describe : describe.skip;
if (!SUPABASE_AVAILABLE) {
    console.warn('Skipping live-draft-ingest integration tests - local Supabase not available');
}

maybeDescribe('/api/live-draft-ingest integration', () => {
    // Route imported lazily so env is loaded before src/lib/supabase.ts reads it.
    let POST: (req: any) => Promise<Response>;
    let service: SupabaseClient<Database>;
    const createdUserIds: string[] = [];

    async function makeUser(): Promise<{ id: string; email: string; password: string }> {
        const email = `ingest-${Date.now()}-${Math.random().toString(36).slice(2)}@integration.local`;
        const password = 'integration-test-password-123';
        const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
        if (error || !data.user) throw error ?? new Error('No user from admin.createUser');
        const id = data.user.id;
        // Migration 006's auth.users trigger creates public.users; upsert to be safe.
        const { error: userErr } = await service.from('users').upsert({ id, email });
        if (userErr) throw userErr;
        createdUserIds.push(id);
        return { id, email, password };
    }

    /** Mint a real secret for the user, exactly as the mint UI does. */
    async function mintToken(userId: string): Promise<string> {
        const secret = mintIngestSecret();
        const { error } = await service.from('user_settings').upsert({
            user_id: userId,
            type: INGEST_SETTING_TYPE,
            key: INGEST_SETTING_KEY,
            data: { secret, createdAt: new Date().toISOString() },
        }, { onConflict: 'user_id,type,key' });
        if (error) throw error;
        return formatIngestToken(userId, secret);
    }

    function frame(seq: number, data: string, captureId = 'cap-integration-1') {
        return { captureId, seq, ts: new Date().toISOString(), dir: 'receive', data };
    }

    function makeRequest(body: unknown, token: string | null) {
        const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Origin': ESPN_ORIGIN };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return new Request('http://localhost/api/live-draft-ingest', {
            method: 'POST', headers, body: JSON.stringify(body),
        }) as any;
    }

    function authedClient(): SupabaseClient<Database> {
        return createClient<Database>(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } });
    }

    beforeAll(async () => {
        service = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!);
        ({ POST } = await import('../route'));
    });

    afterEach(async () => {
        for (const id of createdUserIds) {
            await service.from('live_draft_frames').delete().eq('user_id', id);
            await service.from('user_settings').delete().eq('user_id', id);
            await service.from('users').delete().eq('id', id);
            await service.auth.admin.deleteUser(id).catch(() => {});
        }
        createdUserIds.length = 0;
    });

    it('accepts a valid batch and lands the rows in the database', async () => {
        const user = await makeUser();
        const token = await mintToken(user.id);

        const res = await POST(makeRequest({
            leagueId: LEAGUE_ID,
            frames: [frame(0, 'NOMINATION 1 25000'), frame(1, 'BID 1 4429795 1 25000 24000')],
        }, token));

        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ status: 'ok', received: 2 });
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ESPN_ORIGIN);
        expect(res.headers.get('Cache-Control')).toBe('no-cache');

        const { data } = await service.from('live_draft_frames')
            .select('seq, dir, data').eq('user_id', user.id).order('seq');
        expect(data).toEqual([
            { seq: 0, dir: 'receive', data: 'NOMINATION 1 25000' },
            { seq: 1, dir: 'receive', data: 'BID 1 4429795 1 25000 24000' },
        ]);
    });

    it('dedupes a retried batch via the real unique constraint', async () => {
        const user = await makeUser();
        const token = await mintToken(user.id);
        const body = { leagueId: LEAGUE_ID, frames: [frame(0, 'PING'), frame(1, 'PONG')] };

        expect((await POST(makeRequest(body, token))).status).toBe(200);
        expect((await POST(makeRequest(body, token))).status).toBe(200);

        const { count } = await service.from('live_draft_frames')
            .select('*', { count: 'exact', head: true }).eq('user_id', user.id);
        expect(count).toBe(2);
    });

    it('skips duplicates but inserts new frames in an overlapping batch', async () => {
        const user = await makeUser();
        const token = await mintToken(user.id);

        await POST(makeRequest({ leagueId: LEAGUE_ID, frames: [frame(0, 'PING')] }, token));
        const res = await POST(makeRequest({
            leagueId: LEAGUE_ID,
            frames: [frame(0, 'PING'), frame(1, 'SOLD 1 4429795 2 28 0')],
        }, token));

        expect(res.status).toBe(200);
        const { data } = await service.from('live_draft_frames')
            .select('seq').eq('user_id', user.id).order('seq');
        expect(data!.map(r => r.seq)).toEqual([0, 1]);
    });

    it('rejects a token whose secret does not match the stored one', async () => {
        const user = await makeUser();
        await mintToken(user.id);
        const wrongToken = formatIngestToken(user.id, mintIngestSecret());

        const res = await POST(makeRequest({ leagueId: LEAGUE_ID, frames: [frame(0, 'PING')] }, wrongToken));
        expect(res.status).toBe(401);
    });

    it('rejects a valid-format token for a user with no minted secret', async () => {
        const user = await makeUser();
        const res = await POST(makeRequest(
            { leagueId: LEAGUE_ID, frames: [frame(0, 'PING')] },
            formatIngestToken(user.id, mintIngestSecret()),
        ));
        expect(res.status).toBe(401);
    });

    it('enforces RLS: owners read their frames, other users read nothing', async () => {
        const owner = await makeUser();
        const other = await makeUser();
        const token = await mintToken(owner.id);
        await POST(makeRequest({ leagueId: LEAGUE_ID, frames: [frame(0, 'PING')] }, token));

        const ownerClient = authedClient();
        await ownerClient.auth.signInWithPassword({ email: owner.email, password: owner.password });
        const { data: ownRows } = await ownerClient.from('live_draft_frames').select('data');
        expect(ownRows).toEqual([{ data: 'PING' }]);

        const otherClient = authedClient();
        await otherClient.auth.signInWithPassword({ email: other.email, password: other.password });
        const { data: otherRows } = await otherClient.from('live_draft_frames').select('data');
        expect(otherRows).toEqual([]);
    });

    it('denies direct authenticated inserts (no INSERT policy or grant)', async () => {
        const user = await makeUser();
        const client = authedClient();
        await client.auth.signInWithPassword({ email: user.email, password: user.password });

        const { error } = await client.from('live_draft_frames').insert({
            user_id: user.id,
            league_id: LEAGUE_ID,
            capture_id: 'cap-direct',
            seq: 0,
            ts: new Date().toISOString(),
            dir: 'receive',
            data: 'X',
        } as never);
        expect(error).not.toBeNull();
    });
});
