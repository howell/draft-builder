export interface IngestFrame {
    captureId: string;          // random per-socket id from the userscript
    seq: number;                // monotonic per capture; dedupes retried batches
    ts: string;                 // ISO capture timestamp (client-reported)
    dir: 'send' | 'receive';
    data: string;               // raw frame text, <= MAX_FRAME_DATA_LENGTH chars
}

export interface LiveDraftIngestRequest {
    leagueId: string;           // platform league id (digits)
    frames: IngestFrame[];      // <= MAX_FRAMES_PER_BATCH
}

export interface LiveDraftIngestResponse {
    status: 'ok' | 'error';
    received?: number;          // frames accepted (duplicates count as accepted)
    message?: string;
}

export const MAX_FRAMES_PER_BATCH = 500;
// Must clear the draft room's INIT frame — the one carrying full roster/budget
// state. Measured ~11.2KB and NOT growing with draft progress (start-of-draft
// vs 10-lots-in reconnect differed by 12 chars, 2026-07-27 dress rehearsal),
// but the original 4096 cap silently dropped the batch carrying it, so the
// margin is deliberately huge: losing INIT costs the draft state.
export const MAX_FRAME_DATA_LENGTH = 262144;
