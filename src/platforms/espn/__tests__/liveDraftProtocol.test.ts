import { parseDraftSocketFrame, parseInitBlob, reconstructLots, DraftSocketEvent } from '../liveDraftProtocol';

// All raw frames below are verbatim from the 2026-07-19 test-draft capture
// (draft-captures/390366456-2026-07-19.har), cross-validated against the
// league API's post-draft mDraftDetail flush.
describe('parseDraftSocketFrame', () => {
    it('parses CLOCK frames', () => {
        expect(parseDraftSocketFrame('CLOCK 2 19994 2 4426502 9')).toEqual({
            type: 'clock', phase: 2, msRemaining: 19994, leadingTeamId: 2, playerId: 4426502, currentBid: 9,
        });
    });

    it('parses BID frames', () => {
        expect(parseDraftSocketFrame('BID 3 4426502 12 25000 15988')).toEqual({
            type: 'bid', teamId: 3, playerId: 4426502, amount: 12, timerMs: 25000, msRemaining: 15988,
        });
    });

    it('parses SOLD frames (field 4 is the price)', () => {
        expect(parseDraftSocketFrame('SOLD 2 4426502 10 18 0')).toEqual({
            type: 'sold', teamId: 2, playerId: 4426502, unknown3: 10, price: 18, unknown5: 0,
        });
    });

    it('parses NOMINATION frames (no player: revealed by later CLOCK/BID)', () => {
        expect(parseDraftSocketFrame('NOMINATION 1 25000')).toEqual({
            type: 'nomination', teamId: 1, timerMs: 25000,
        });
    });

    it('parses AUTODRAFT in both server-broadcast and client-request forms', () => {
        expect(parseDraftSocketFrame('AUTODRAFT 4 false')).toEqual({ type: 'autodraft', teamId: 4, enabled: false });
        expect(parseDraftSocketFrame('AUTODRAFT true')).toEqual({ type: 'autodraft', teamId: null, enabled: true });
    });

    it('parses TOKEN frames without splitting the SWID', () => {
        expect(parseDraftSocketFrame('TOKEN 1:390366456:4:{A9F38A4C-008C-41EE-949C-5F725EB67A24}:1655956939')).toEqual({
            type: 'token', gameId: '1', leagueId: '390366456', teamId: '4', memberId: '{A9F38A4C-008C-41EE-949C-5F725EB67A24}',
        });
    });

    it('parses housekeeping frames', () => {
        expect(parseDraftSocketFrame('PASSED 4 4426502 false')).toEqual({ type: 'passed', teamId: 4, playerId: 4426502, flag: false });
        expect(parseDraftSocketFrame('JOINED 4 {A9F38A4C}')).toEqual({ type: 'joined', teamId: 4, memberId: '{A9F38A4C}' });
        expect(parseDraftSocketFrame('AUTOSUGGEST 4426502')).toEqual({ type: 'autosuggest', playerId: 4426502 });
        expect(parseDraftSocketFrame('STATE 2')).toEqual({ type: 'state', value: 2 });
        expect(parseDraftSocketFrame('PING PING%201784512356336')).toEqual({ type: 'ping' });
        expect(parseDraftSocketFrame('INIT AAAAAQAAAAE=')).toEqual({ type: 'init', blob: 'AAAAAQAAAAE=' });
    });

    it('preserves unrecognized verbs instead of throwing', () => {
        expect(parseDraftSocketFrame('WAT 1 2 3')).toEqual({ type: 'unknown', verb: 'WAT', raw: 'WAT 1 2 3' });
    });
});

describe('parseInitBlob', () => {
    const LEAGUE = 390366456;

    /** Build a 45-byte ledger record as observed in real INIT blobs. */
    function record(teamId: number, pickNumber: number, playerId: number, slot: number, price: number): Buffer {
        const b = Buffer.alloc(45);
        b.writeUInt32BE(LEAGUE, 0);
        b.writeUInt32BE(teamId, 4);
        b.writeUInt32BE(pickNumber, 8);
        b.writeInt32BE(playerId, 12);
        b.writeUInt32BE(slot, 16);
        b.writeUInt32BE(price, 20);
        return b;
    }

    function blob(...parts: Buffer[]): string {
        return Buffer.concat(parts).toString('base64');
    }

    const noise = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1]);

    it('decodes completed and pending picks from the ledger', () => {
        const b = blob(noise,
            record(1, 1, 4429795, 2, 28),
            record(3, 2, 4430807, 2, 25),
            record(4, 3, -16034, 16, 1),   // D/ST: negative id is a real player
            record(4, 4, -1, 0, 0),        // pending slot
            record(1, 5, -1, 0, 0),
            noise);
        const state = parseInitBlob(b, LEAGUE);
        expect(state).not.toBeNull();
        expect(state!.completedPicks).toEqual([
            { pickNumber: 1, teamId: 1, playerId: 4429795, slotIdHint: 2, price: 28 },
            { pickNumber: 2, teamId: 3, playerId: 4430807, slotIdHint: 2, price: 25 },
            { pickNumber: 3, teamId: 4, playerId: -16034, slotIdHint: 16, price: 1 },
        ]);
        expect(state!.pendingPicks).toEqual([
            { pickNumber: 4, scheduledNominatingTeamId: 4 },
            { pickNumber: 5, scheduledNominatingTeamId: 1 },
        ]);
    });

    it('is not thrown off by a stray league id shortly before the ledger', () => {
        // Regression: a stray id at an offset that is not a multiple of the
        // record size once caused the locator to skip past the ledger start.
        const stray = Buffer.alloc(6);
        stray.writeUInt32BE(LEAGUE, 1);
        const b = blob(stray,
            record(1, 1, 4429795, 2, 28),
            record(2, 2, 4430807, 2, 25),
            record(3, 3, 4374302, 4, 20),
            record(4, 4, -1, 0, 0),
            record(1, 5, -1, 0, 0));
        const state = parseInitBlob(b, LEAGUE);
        expect(state!.completedPicks).toHaveLength(3);
        expect(state!.completedPicks[0].pickNumber).toBe(1);
    });

    it('returns null when no ledger is present', () => {
        expect(parseInitBlob(noise.toString('base64'), LEAGUE)).toBeNull();
        expect(parseInitBlob('', LEAGUE)).toBeNull();
    });
});

describe('reconstructLots', () => {
    const ev = (frame: string): { event: DraftSocketEvent } => ({ event: parseDraftSocketFrame(frame) });

    it('reconstructs a full lot: nomination opening bid, bidding war, hammer', () => {
        const lots = reconstructLots([
            ev('NOMINATION 1 25000'),
            ev('BID 1 4428331 1 25000 24000'),
            ev('CLOCK 2 24000 1 4428331 1'),
            ev('BID 3 4428331 8 25000 20000'),
            ev('BID 2 4428331 11 25000 18000'),
            ev('BID 3 4428331 17 25000 15000'),
            ev('SOLD 3 4428331 11 17 0'),
        ]);
        expect(lots).toHaveLength(1);
        expect(lots[0]).toMatchObject({
            playerId: 4428331,
            nominatingTeamId: 1,
            winningTeamId: 3,
            price: 17,
            biddingTeamIds: [1, 3, 2],
        });
        expect(lots[0].bids.map(b => b.amount)).toEqual([1, 8, 11, 17]);
    });

    it('synthesizes the opening bid from CLOCK when joining mid-lot', () => {
        const lots = reconstructLots([
            ev('CLOCK 2 24056 4 4426502 1'),
            ev('BID 2 4426502 9 25000 19994'),
            ev('SOLD 2 4426502 10 18 0'),
        ]);
        expect(lots[0]).toMatchObject({ playerId: 4426502, nominatingTeamId: 4, winningTeamId: 2, price: 18 });
        expect(lots[0].bids).toHaveLength(2);
    });

    it('tracks D/ST lots (negative player IDs) but ignores the -1 sentinel', () => {
        const lots = reconstructLots([
            ev('CLOCK 2 24000 4 -16034 1'),
            ev('SOLD 4 -16034 16 1 0'),
            ev('CLOCK 1 5000 0 -1 0'),
        ]);
        expect(lots).toHaveLength(1);
        expect(lots[0]).toMatchObject({ playerId: -16034, winningTeamId: 4, price: 1 });
    });

    it('does not double-count the nominator when the opening BID frame is present', () => {
        const lots = reconstructLots([
            ev('BID 2 4379399 1 25000 24000'),
            ev('CLOCK 2 24000 2 4379399 1'),
            ev('SOLD 2 4379399 3 1 0'),
        ]);
        expect(lots[0].bids).toHaveLength(1);
        expect(lots[0].nominatingTeamId).toBe(2);
    });

    it('records PASSED events positioned by preceding bid count', () => {
        const lots = reconstructLots([
            ev('BID 1 4428331 1 25000 24000'),
            ev('PASSED 4 4428331 false'),
            ev('BID 3 4428331 8 25000 20000'),
            ev('PASSED 2 4428331 false'),
            ev('SOLD 3 4428331 11 8 0'),
        ]);
        expect(lots[0].passes).toEqual([
            { teamId: 4, atMs: null, afterBidIndex: 1 },
            { teamId: 2, atMs: null, afterBidIndex: 2 },
        ]);
    });

    it('ignores PASSED frames for the empty-lot sentinel', () => {
        const lots = reconstructLots([ev('PASSED 4 -1 false')]);
        expect(lots).toHaveLength(0);
    });

    it('captures soldAtMs from the SOLD event timestamp', () => {
        const lots = reconstructLots([
            { ...ev('BID 2 4426502 1 25000 24000'), atMs: 1000 },
            { ...ev('SOLD 2 4426502 10 18 0'), atMs: 2500 },
        ]);
        expect(lots[0].soldAtMs).toBe(2500);
        expect(lots[0].bids[0].atMs).toBe(1000);
    });

    it('leaves soldAtMs null for unsold lots and timestamp-less streams', () => {
        const unsold = reconstructLots([ev('BID 2 4426502 1 25000 24000')]);
        expect(unsold[0].soldAtMs).toBeNull();
        const noTs = reconstructLots([ev('BID 2 4426502 1 25000 24000'), ev('SOLD 2 4426502 10 18 0')]);
        expect(noTs[0].soldAtMs).toBeNull();
    });
});
