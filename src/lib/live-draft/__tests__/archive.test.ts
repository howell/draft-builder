import { archiveFramesToJsonl, ArchivedFrame } from '../archive';

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
