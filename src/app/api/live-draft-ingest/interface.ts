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
export const MAX_FRAME_DATA_LENGTH = 4096;
