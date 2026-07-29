/**
 * Shared builders for draft-room frame fixtures (liveBoard/archiveExtract
 * tests): raw protocol frames and 45-byte INIT ledger records as observed in
 * real capture blobs.
 */

import { BoardFrame } from '../../liveBoard';

export function makeFrameFixtures(league: number) {
    let autoId = 1;

    function frame(
        captureId: string,
        seq: number,
        data: string,
        id?: number,
        dir: 'send' | 'receive' = 'receive',
        ts = '2026-07-27T12:45:00.000Z'
    ): BoardFrame {
        return { id: id ?? autoId++, captureId, seq, ts, dir, data };
    }

    /** 45-byte INIT ledger record, as observed in real blobs. */
    function record(teamId: number, pickNumber: number, playerId: number, price: number): Buffer {
        const b = Buffer.alloc(45);
        b.writeUInt32BE(league, 0);
        b.writeUInt32BE(teamId, 4);
        b.writeUInt32BE(pickNumber, 8);
        b.writeInt32BE(playerId, 12);
        b.writeUInt32BE(7, 16); // slot hint (unused)
        b.writeUInt32BE(price, 20);
        return b;
    }

    function pending(teamId: number, pickNumber: number): Buffer {
        return record(teamId, pickNumber, -1, 0);
    }

    function initFrame(captureId: string, seq: number, id: number, ...records: Buffer[]): BoardFrame {
        return frame(captureId, seq, `INIT ${Buffer.concat(records).toString('base64')}`, id);
    }

    function resetIds(): void {
        autoId = 1;
    }

    return { frame, record, pending, initFrame, resetIds };
}
