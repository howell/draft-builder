import { NextRequest, NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { makeResponse } from '@/app/api/utils';
import { createSupabaseServerClient } from '@/lib/supabase';
import {
    INGEST_SETTING_KEY,
    INGEST_SETTING_TYPE,
    IngestSettingData,
    parseIngestToken,
} from '@/lib/live-draft/ingestToken';
import {
    IngestFrame,
    LiveDraftIngestRequest,
    LiveDraftIngestResponse,
    MAX_FRAMES_PER_BATCH,
    MAX_FRAME_DATA_LENGTH,
} from './interface';

// The tap userscript POSTs from the ESPN draft room with page-context fetch,
// so this route must answer CORS preflights and carry ACAO on every response —
// without it the browser hides the response and the userscript re-queues
// successful batches forever.
const ALLOWED_ORIGINS = ['https://fantasy.espn.com', 'https://lm.fantasy.espn.com'];

const CAPTURE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const LEAGUE_ID_RE = /^\d{1,32}$/;

function corsHeaders(origin: string | null): Record<string, string> {
    const headers: Record<string, string> = { 'Vary': 'Origin' };
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'content-type, authorization';
        headers['Access-Control-Max-Age'] = '86400';
    }
    return headers;
}

// Hash both sides before comparing: guarantees equal-length buffers (so
// timingSafeEqual cannot throw) and leaks neither content nor length.
function secretsMatch(provided: string, stored: string): boolean {
    const a = createHash('sha256').update(provided).digest();
    const b = createHash('sha256').update(stored).digest();
    return timingSafeEqual(a, b);
}

function isIngestFrame(f: any): f is IngestFrame {
    return !!f
        && typeof f.captureId === 'string' && CAPTURE_ID_RE.test(f.captureId)
        && typeof f.seq === 'number' && Number.isInteger(f.seq) && f.seq >= 0
        && (f.dir === 'send' || f.dir === 'receive')
        && typeof f.data === 'string' && f.data.length > 0 && f.data.length <= MAX_FRAME_DATA_LENGTH
        && (f.ts === undefined || typeof f.ts === 'string');
}

export async function OPTIONS(req: NextRequest) {
    return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

export async function POST(req: NextRequest) {
    const cors = corsHeaders(req.headers.get('origin'));
    const respond = (body: LiveDraftIngestResponse, status: number) =>
        makeResponse<LiveDraftIngestResponse>(body, status, false, 0, cors);

    try {
        // -- Authenticate: the token, not the body, decides whose rows these are.
        const authHeader = req.headers.get('authorization') ?? '';
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : '';
        const parsed = token ? parseIngestToken(token) : null;
        if (!parsed) {
            return respond({ status: 'error', message: 'Invalid ingest token' }, 401);
        }

        const supabase = createSupabaseServerClient();
        const { data: settingRow, error: settingError } = await supabase
            .from('user_settings')
            .select('data')
            .eq('user_id', parsed.userId)
            .eq('type', INGEST_SETTING_TYPE)
            .eq('key', INGEST_SETTING_KEY)
            .maybeSingle();

        if (settingError) {
            console.error('[LiveDraftIngest] Failed to load ingest secret:', settingError);
            return respond({ status: 'error', message: 'Server error' }, 500);
        }
        const stored = settingRow?.data as IngestSettingData | undefined;
        if (!stored?.secret || !secretsMatch(parsed.secret, stored.secret)) {
            return respond({ status: 'error', message: 'Invalid ingest token' }, 401);
        }

        // -- Validate shape/size strictly; frame content stays opaque.
        const body = await req.json().catch(() => null) as LiveDraftIngestRequest | null;
        if (!body || typeof body.leagueId !== 'string' || !LEAGUE_ID_RE.test(body.leagueId)
            || !Array.isArray(body.frames)) {
            return respond({ status: 'error', message: 'Malformed request body' }, 400);
        }
        if (body.frames.length === 0) {
            return respond({ status: 'ok', received: 0 }, 200);
        }
        if (body.frames.length > MAX_FRAMES_PER_BATCH) {
            return respond({ status: 'error', message: `Too many frames (max ${MAX_FRAMES_PER_BATCH})` }, 400);
        }
        if (!body.frames.every(isIngestFrame)) {
            return respond({ status: 'error', message: 'Malformed frame in batch' }, 400);
        }

        // Never log frame data or the token — frames can embed the SWID.
        console.log('[LiveDraftIngest] Batch:', {
            userId: parsed.userId,
            leagueId: body.leagueId,
            frames: body.frames.length,
        });

        const rows = body.frames.map(f => ({
            user_id: parsed.userId,
            league_id: body.leagueId,
            capture_id: f.captureId,
            seq: f.seq,
            ts: f.ts && !isNaN(Date.parse(f.ts)) ? f.ts : new Date().toISOString(),
            dir: f.dir,
            data: f.data,
        }));

        // ignoreDuplicates makes retried batches a silent no-op (unique
        // user_id, capture_id, seq).
        const { error: insertError } = await supabase
            .from('live_draft_frames')
            .upsert(rows, { onConflict: 'user_id,capture_id,seq', ignoreDuplicates: true });

        if (insertError) {
            console.error('[LiveDraftIngest] Insert failed:', insertError);
            return respond({ status: 'error', message: 'Server error' }, 500);
        }

        return respond({ status: 'ok', received: rows.length }, 200);
    } catch (error) {
        console.error('[LiveDraftIngest] Error:', error);
        return respond({ status: 'error', message: 'Server error' }, 500);
    }
}
