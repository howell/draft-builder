import { OPTIONS, POST } from '../route';
import { createSupabaseServerClient } from '@/lib/supabase';
import { formatIngestToken, mintIngestSecret } from '@/lib/live-draft/ingestToken';
import { MAX_FRAMES_PER_BATCH, MAX_FRAME_DATA_LENGTH } from '../interface';

jest.mock('@/lib/supabase', () => ({
    createSupabaseServerClient: jest.fn(),
}));

// The global next/server mock (jest.setup.ts) only provides NextResponse.json;
// this route constructs NextResponse directly, so give it a real class backed
// by the whatwg-fetch Response that jest.setup installs globally.
jest.mock('next/server', () => ({
    NextResponse: class NextResponseMock extends Response {
        static json(data: unknown, init?: ResponseInit) {
            return new NextResponseMock(JSON.stringify(data), init);
        }
    },
}));

const mockCreateClient = createSupabaseServerClient as jest.Mock;

const USER_ID = 'adcf21b2-a16b-4053-884e-b486186310d2';
const SECRET = mintIngestSecret();
const TOKEN = formatIngestToken(USER_ID, SECRET);
const ESPN_ORIGIN = 'https://fantasy.espn.com';

function frame(seq: number, data = 'BID 2 4426502 9 25000 19994') {
    return { captureId: 'cap-test-0001', seq, ts: '2026-07-20T00:00:00.000Z', dir: 'receive', data };
}

/**
 * Build a mock service client. `storedSecret` controls the user_settings
 * lookup; `insertError` makes the frames upsert fail.
 */
function mockSupabase({ storedSecret, insertError }: { storedSecret?: string | null; insertError?: object } = {}) {
    const upsert = jest.fn().mockResolvedValue({ error: insertError ?? null });
    const maybeSingle = jest.fn().mockResolvedValue({
        data: storedSecret === null || storedSecret === undefined
            ? null
            : { data: { secret: storedSecret, createdAt: '2026-07-20T00:00:00Z' } },
        error: null,
    });
    const settingsChain = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle };
    const from = jest.fn((table: string) => (table === 'user_settings' ? settingsChain : { upsert }));
    mockCreateClient.mockReturnValue({ from });
    return { upsert, from };
}

function makeRequest(body: unknown, { token = TOKEN, origin = ESPN_ORIGIN }: { token?: string | null; origin?: string } = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Origin': origin };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return new Request('http://localhost/api/live-draft-ingest', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    }) as any;
}

const validBody = { leagueId: '390366456', frames: [frame(0), frame(1)] };

describe('/api/live-draft-ingest', () => {
    beforeEach(() => jest.clearAllMocks());

    describe('authentication', () => {
        it.each([
            ['missing token', null],
            ['garbage token', 'not-a-token'],
            ['well-formed token with bad secret charset', `${btoa(USER_ID)}.has spaces`],
        ])('rejects %s with 401', async (_name, token) => {
            mockSupabase({ storedSecret: SECRET });
            const res = await POST(makeRequest(validBody, { token: token as any }));
            expect(res.status).toBe(401);
        });

        it('rejects a user with no stored secret', async () => {
            mockSupabase({ storedSecret: null });
            const res = await POST(makeRequest(validBody));
            expect(res.status).toBe(401);
        });

        it('rejects a wrong secret, including length mismatches', async () => {
            mockSupabase({ storedSecret: mintIngestSecret() });
            expect((await POST(makeRequest(validBody))).status).toBe(401);

            // stored secret much shorter than provided — must not throw
            mockSupabase({ storedSecret: 'aaaaaaaaaaaaaaaaaaaa' });
            expect((await POST(makeRequest(validBody))).status).toBe(401);
        });

        it('never inserts when auth fails', async () => {
            const { upsert } = mockSupabase({ storedSecret: null });
            await POST(makeRequest(validBody));
            expect(upsert).not.toHaveBeenCalled();
        });
    });

    describe('validation', () => {
        beforeEach(() => mockSupabase({ storedSecret: SECRET }));

        it.each([
            ['non-numeric leagueId', { ...validBody, leagueId: 'abc' }],
            ['missing frames', { leagueId: '1' }],
            ['oversized frame data', { ...validBody, frames: [frame(0, 'x'.repeat(MAX_FRAME_DATA_LENGTH + 1))] }],
            ['bad dir', { ...validBody, frames: [{ ...frame(0), dir: 'sideways' }] }],
            ['non-string data', { ...validBody, frames: [{ ...frame(0), data: 42 }] }],
            ['negative seq', { ...validBody, frames: [{ ...frame(0), seq: -1 }] }],
            ['bad captureId', { ...validBody, frames: [{ ...frame(0), captureId: 'x' }] }],
        ])('rejects %s with 400', async (_name, body) => {
            expect((await POST(makeRequest(body))).status).toBe(400);
        });

        it('rejects over-long batches with 400', async () => {
            const frames = Array.from({ length: MAX_FRAMES_PER_BATCH + 1 }, (_, i) => frame(i));
            expect((await POST(makeRequest({ leagueId: '1', frames }))).status).toBe(400);
        });

        it('accepts an empty batch as a no-op', async () => {
            const { upsert } = mockSupabase({ storedSecret: SECRET });
            const res = await POST(makeRequest({ leagueId: '1', frames: [] }));
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ status: 'ok', received: 0 });
            expect(upsert).not.toHaveBeenCalled();
        });
    });

    describe('insertion', () => {
        it('maps frames to snake_case rows with user_id from the token, deduped upsert', async () => {
            const { upsert } = mockSupabase({ storedSecret: SECRET });
            const res = await POST(makeRequest(validBody));
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ status: 'ok', received: 2 });
            expect(upsert).toHaveBeenCalledWith(
                [
                    expect.objectContaining({
                        user_id: USER_ID,
                        league_id: '390366456',
                        capture_id: 'cap-test-0001',
                        seq: 0,
                        dir: 'receive',
                        data: 'BID 2 4426502 9 25000 19994',
                        ts: '2026-07-20T00:00:00.000Z',
                    }),
                    expect.objectContaining({ seq: 1 }),
                ],
                { onConflict: 'user_id,capture_id,seq', ignoreDuplicates: true },
            );
            // identity pk: rows must not carry an explicit id
            expect(upsert.mock.calls[0][0][0]).not.toHaveProperty('id');
        });

        it('treats a retried duplicate batch as success', async () => {
            mockSupabase({ storedSecret: SECRET });
            expect((await POST(makeRequest(validBody))).status).toBe(200);
            expect((await POST(makeRequest(validBody))).status).toBe(200);
        });

        it('returns 500 when the insert fails (userscript retries 5xx)', async () => {
            mockSupabase({ storedSecret: SECRET, insertError: { code: 'XX000' } });
            expect((await POST(makeRequest(validBody))).status).toBe(500);
        });

        it('substitutes server time for unparseable ts', async () => {
            const { upsert } = mockSupabase({ storedSecret: SECRET });
            await POST(makeRequest({ leagueId: '1', frames: [{ ...frame(0), ts: 'garbage' }] }));
            const ts = upsert.mock.calls[0][0][0].ts;
            expect(isNaN(Date.parse(ts))).toBe(false);
        });
    });

    describe('CORS', () => {
        it('answers preflight from an allowed origin with the exact header set', async () => {
            const req = new Request('http://localhost/api/live-draft-ingest', {
                method: 'OPTIONS',
                headers: { 'Origin': ESPN_ORIGIN, 'Access-Control-Request-Method': 'POST' },
            }) as any;
            const res = await OPTIONS(req);
            expect(res.status).toBe(204);
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ESPN_ORIGIN);
            expect(res.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
            expect(res.headers.get('Access-Control-Allow-Headers')).toBe('content-type, authorization');
            expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
            expect(res.headers.get('Vary')).toBe('Origin');
        });

        it('omits ACAO for a non-allowlisted origin', async () => {
            const req = new Request('http://localhost/api/live-draft-ingest', {
                method: 'OPTIONS',
                headers: { 'Origin': 'https://evil.example' },
            }) as any;
            const res = await OPTIONS(req);
            expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
        });

        it('carries ACAO and no-store on POST responses', async () => {
            mockSupabase({ storedSecret: SECRET });
            const res = await POST(makeRequest(validBody));
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ESPN_ORIGIN);
            expect(res.headers.get('Cache-Control')).toBe('no-store');
        });

        it('carries ACAO even on auth failures so the userscript can read the status', async () => {
            mockSupabase({ storedSecret: SECRET });
            const res = await POST(makeRequest(validBody, { token: 'bad' }));
            expect(res.status).toBe(401);
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ESPN_ORIGIN);
        });
    });
});
