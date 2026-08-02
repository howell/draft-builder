import { archiveFramesToJsonl, fetchArchiveBids, ArchivedFrame } from '../archive';

describe('archiveFramesToJsonl', () => {
    const frame = (overrides: Partial<ArchivedFrame> = {}): ArchivedFrame => ({
        sourceFrameId: 1,
        captureId: 'cap-a',
        seq: 0,
        ts: '2026-08-30T00:00:01.000Z',
        dir: 'receive',
        data: 'SOLD 2 101 10 18 0',
        ...overrides,
    });

    it('serializes to the userscript badge format, one frame per line, trailing newline', () => {
        const jsonl = archiveFramesToJsonl([frame(), frame({ seq: 1, data: 'PING 1' })]);
        const lines = jsonl.split('\n');
        expect(lines).toHaveLength(3); // two frames + trailing newline
        expect(lines[2]).toBe('');
        expect(JSON.parse(lines[0])).toEqual({
            captureId: 'cap-a',
            seq: 0,
            ts: '2026-08-30T00:00:01.000Z',
            dir: 'receive',
            data: 'SOLD 2 101 10 18 0',
        });
        // No sourceFrameId leak: the corpus format has exactly these keys.
        expect(Object.keys(JSON.parse(lines[1]))).toEqual(['captureId', 'seq', 'ts', 'dir', 'data']);
    });

    it('normalizes Postgres +00:00 timestamps to the corpus Z format', () => {
        const jsonl = archiveFramesToJsonl([frame({ ts: '2026-08-30 00:00:01.5+00:00' })]);
        expect(JSON.parse(jsonl.trim()).ts).toBe('2026-08-30T00:00:01.500Z');
    });

    it('returns an empty string for no frames', () => {
        expect(archiveFramesToJsonl([])).toBe('');
    });
});

describe('fetchArchiveBids', () => {
    type BidRow = {
        player_id: number;
        seq: number;
        kind: string;
        team_id: number;
        amount: number | null;
        at_ms: number | null;
    };
    const row = (playerId: number, seq: number): BidRow => ({
        player_id: playerId,
        seq,
        kind: seq === 0 ? 'open' : 'bid',
        team_id: 3,
        amount: seq + 1,
        at_ms: 1_000_000 + seq,
    });

    /** Stubs just the builder chain fetchArchiveBids uses, one page per call. */
    const mockClient = (pages: (BidRow[] | { error: string })[]) => {
        const ranges: [number, number][] = [];
        let call = 0;
        const client = {
            from: () => ({
                select: () => ({
                    eq: () => ({
                        order: () => ({
                            order: () => ({
                                range: (from: number, to: number) => {
                                    ranges.push([from, to]);
                                    const page = pages[call++] ?? [];
                                    return Promise.resolve(
                                        Array.isArray(page)
                                            ? { data: page, error: null }
                                            : { data: null, error: new Error(page.error) }
                                    );
                                },
                            }),
                        }),
                    }),
                }),
            }),
        };
        return { client: client as unknown as Parameters<typeof fetchArchiveBids>[0], ranges };
    };

    it('drains past the PostgREST row cap in 1000-row pages', async () => {
        // A real draft: 2024 events, but each response is capped at 1000 rows.
        const full = (start: number) => Array.from({ length: 1000 }, (_, i) => row(start + i, 1));
        const { client, ranges } = mockClient([full(0), full(1000), Array.from({ length: 24 }, (_, i) => row(2000 + i, 1))]);

        const bids = await fetchArchiveBids(client, 'archive-1');

        expect(bids).toHaveLength(2024);
        expect(ranges).toEqual([
            [0, 999],
            [1000, 1999],
            [2000, 2999],
        ]);
    });

    it('maps rows to camelCase and stops after a short page', async () => {
        const { client, ranges } = mockClient([[row(101, 0), row(101, 1)]]);

        const bids = await fetchArchiveBids(client, 'archive-1');

        expect(ranges).toEqual([[0, 999]]);
        expect(bids).toEqual([
            { playerId: 101, seq: 0, kind: 'open', teamId: 3, amount: 1, atMs: 1_000_000 },
            { playerId: 101, seq: 1, kind: 'bid', teamId: 3, amount: 2, atMs: 1_000_001 },
        ]);
    });

    it('stops on an empty page after a full one', async () => {
        const full = Array.from({ length: 1000 }, (_, i) => row(i, 0));
        const { client, ranges } = mockClient([full, []]);

        const bids = await fetchArchiveBids(client, 'archive-1');

        expect(bids).toHaveLength(1000);
        expect(ranges).toHaveLength(2);
    });

    it('throws on a page error', async () => {
        const { client } = mockClient([{ error: 'boom' }]);
        await expect(fetchArchiveBids(client, 'archive-1')).rejects.toThrow('boom');
    });
});
