/**
 * Tests for the player-values route, in particular the PostgREST max-rows
 * regression: a single multi-season query silently truncated at 1000 rows
 * once the historical backfill landed (~280 kit rows × 7 seasons), so later
 * seasons came back empty. The route must issue bounded per-season queries
 * and narrow API-source seasons to their latest snapshot server-side.
 */

import { GET } from '../route';
import { createSupabaseServerClient } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({
    createSupabaseServerClient: jest.fn(),
}));

// The route constructs NextResponse directly (via makeResponse); back it with
// the real Response class like the other API route tests do.
jest.mock('next/server', () => ({
    NextResponse: class NextResponseMock extends Response {
        static json(data: unknown, init?: ResponseInit) {
            return new NextResponseMock(JSON.stringify(data), init);
        }
    },
}));

const mockCreateClient = createSupabaseServerClient as jest.Mock;

interface QueryRecord {
    select: string;
    filters: Record<string, unknown>;
    /** upper bounds applied via .lte(), keyed by column */
    upperBounds: Record<string, unknown>;
    order?: string;
    orderAscending?: boolean;
    limit?: number;
}

type Resolver = (q: QueryRecord) => { data?: any[] | null; error?: { message: string } | null };

/**
 * Chainable, awaitable supabase query stub. Every `.from()` call records the
 * filters applied to it; awaiting the builder passes the record to `resolver`.
 * There is deliberately no `.in()` — the truncation bug came from a combined
 * multi-season query, so any attempt to use one fails the test loudly.
 */
function mockSupabase(resolver: Resolver) {
    const queries: QueryRecord[] = [];
    const from = jest.fn(() => {
        const q: QueryRecord = { select: '', filters: {}, upperBounds: {} };
        queries.push(q);
        const builder: any = {
            select: (cols: string) => { q.select = cols; return builder; },
            eq: (col: string, val: unknown) => { q.filters[col] = val; return builder; },
            lte: (col: string, val: unknown) => { q.upperBounds[col] = val; return builder; },
            order: (col: string, opts?: { ascending?: boolean }) => {
                q.order = col;
                q.orderAscending = opts?.ascending;
                return builder;
            },
            limit: (n: number) => { q.limit = n; return builder; },
            then: (onFulfilled: any, onRejected: any) =>
                Promise.resolve(resolver(q))
                    .then(r => ({ data: r.data ?? null, error: r.error ?? null }))
                    .then(onFulfilled, onRejected),
        };
        return builder;
    });
    mockCreateClient.mockReturnValue({ from });
    return { queries };
}

function row(season: string, source: string, snapshotDate: string, name: string) {
    return {
        season,
        source,
        snapshot_date: snapshotDate,
        rank_type: 'PPR',
        player_id: `id-${name}`,
        player_name: name,
        position: 'RB',
        overall_rank: 1,
        position_rank: 1,
        auction_value: 40,
    };
}

function makeRequest(seasons: string[], asOf?: string) {
    const url = new URL('http://localhost/api/player-values');
    url.searchParams.set('seasons', JSON.stringify(seasons));
    if (asOf !== undefined) url.searchParams.set('asOf', JSON.stringify(asOf));
    return { nextUrl: url } as any;
}

describe('GET /api/player-values', () => {
    it('serves draft-kit rows with one bounded query per season', async () => {
        const seasons = ['2019', '2020', '2021', '2022', '2023', '2024', '2025'];
        const { queries } = mockSupabase(q =>
            q.filters.source === 'draft_kit_pdf'
                ? { data: [row(q.filters.season as string, 'draft_kit_pdf', '2025-08-01', `kit-${q.filters.season}`)] }
                : { data: [] }
        );

        const res = await GET(makeRequest(seasons));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.status).toBe('ok');
        // One hour, not the default day — daily snapshots made 24h staleness real.
        expect(res.headers.get('Cache-Control')).toContain('max-age=3600');
        for (const season of seasons) {
            expect(body.data[season]).toHaveLength(1);
            expect(body.data[season][0]).toMatchObject({
                playerName: `kit-${season}`,
                auctionValue: 40,
                source: 'draft_kit_pdf',
            });
        }
        // The regression guard: every query is scoped to a single season.
        expect(queries.length).toBeGreaterThanOrEqual(seasons.length);
        for (const q of queries) {
            expect(q.filters.season).toBeDefined();
        }
    });

    it('falls back to only the latest API snapshot for kit-less seasons', async () => {
        const { queries } = mockSupabase(q => {
            if (q.filters.source === 'draft_kit_pdf') return { data: [] };
            if (q.select === 'snapshot_date') return { data: [{ snapshot_date: '2026-07-26' }] };
            return { data: [row('2026', 'api', '2026-07-26', 'Jahmyr Gibbs')] };
        });

        const res = await GET(makeRequest(['2026']));
        const body = await res.json();

        expect(body.data['2026']).toHaveLength(1);
        expect(body.data['2026'][0]).toMatchObject({
            playerName: 'Jahmyr Gibbs',
            source: 'api',
            snapshotDate: '2026-07-26',
        });
        // The snapshot fetch must be narrowed in the query, not filtered
        // client-side, so accumulating daily snapshots can't hit the row cap.
        const snapshotFetch = queries[queries.length - 1];
        expect(snapshotFetch.filters.snapshot_date).toBe('2026-07-26');
    });

    it('returns an empty list for seasons with no data at all', async () => {
        mockSupabase(() => ({ data: [] }));

        const res = await GET(makeRequest(['2018']));
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.data['2018']).toEqual([]);
    });

    it('pins API-source seasons to the snapshot on or before asOf', async () => {
        const { queries } = mockSupabase(q => {
            if (q.filters.source === 'draft_kit_pdf') return { data: [] };
            if (q.select === 'snapshot_date') {
                // Later snapshots exist, but the bounded resolution must win.
                return q.upperBounds.snapshot_date === '2026-08-01'
                    ? { data: [{ snapshot_date: '2026-08-01' }] }
                    : { data: [{ snapshot_date: '2026-08-09' }] };
            }
            return { data: [row('2026', 'api', q.filters.snapshot_date as string, 'Bijan Robinson')] };
        });

        const res = await GET(makeRequest(['2026'], '2026-08-01'));
        const body = await res.json();

        expect(body.data['2026'][0]).toMatchObject({
            playerName: 'Bijan Robinson',
            snapshotDate: '2026-08-01',
        });
        const resolution = queries.find(q => q.select === 'snapshot_date');
        expect(resolution?.upperBounds.snapshot_date).toBe('2026-08-01');
    });

    it('falls back to the earliest snapshot when every snapshot postdates asOf', async () => {
        const { queries } = mockSupabase(q => {
            if (q.filters.source === 'draft_kit_pdf') return { data: [] };
            if (q.select === 'snapshot_date') {
                // Nothing on or before asOf; the ascending re-query finds the earliest.
                return q.upperBounds.snapshot_date ? { data: [] } : { data: [{ snapshot_date: '2026-07-26' }] };
            }
            return { data: [row('2026', 'api', '2026-07-26', 'Jahmyr Gibbs')] };
        });

        const res = await GET(makeRequest(['2026'], '2026-07-01'));
        const body = await res.json();

        expect(body.data['2026'][0].snapshotDate).toBe('2026-07-26');
        const fallback = queries.find(q => q.select === 'snapshot_date' && !q.upperBounds.snapshot_date);
        expect(fallback?.orderAscending).toBe(true);
    });

    it('serves frozen kit rows regardless of asOf', async () => {
        mockSupabase(q =>
            q.filters.source === 'draft_kit_pdf'
                ? { data: [row('2024', 'draft_kit_pdf', '2024-09-01', 'kit-2024')] }
                : { data: [] }
        );

        const res = await GET(makeRequest(['2024'], '2024-01-15'));
        const body = await res.json();

        expect(body.data['2024'][0].source).toBe('draft_kit_pdf');
    });

    it('rejects a malformed asOf date', async () => {
        mockSupabase(() => ({ data: [] }));

        const res = await GET(makeRequest(['2026'], 'August 1st'));
        const body = await res.json();

        expect(res.status).toBe(400);
        expect(body.status).toContain('asOf');
    });

    it('surfaces query errors as a 500', async () => {
        mockSupabase(() => ({ error: { message: 'boom' } }));

        const res = await GET(makeRequest(['2023']));
        const body = await res.json();

        expect(res.status).toBe(500);
        expect(body.status).toContain('boom');
        // A cached failure would pin the outage for the whole TTL.
        expect(res.headers.get('Cache-Control')).toBe('no-store');
    });
});
