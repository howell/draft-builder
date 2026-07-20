#!/usr/bin/env ts-node
/**
 * Poll ESPN's mDraftDetail view during a live draft to (a) answer how live it
 * is mid-draft and (b) archive the raw pick stream as a backtest corpus.
 *
 * Every poll appends a compact summary line to the capture file; whenever the
 * response meaningfully changes (pick count, drafted/inProgress flags) the
 * full raw body is archived too, so update cadence is measurable without
 * storing ~720 full bodies per draft.
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/poll-draft.ts --league <id> [--season 2026] [--interval 5000]
 *
 * Env: ESPN_SWID + ESPN_S2 (read from .env.local if not exported). Only
 * needed for private leagues; public test leagues work without them.
 * Output: draft-captures/<leagueId>-<start time>.jsonl
 */

import fs from 'fs';
import path from 'path';

const BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/';

interface RawPick {
    overallPickNumber: number;
    playerId: number;
    teamId: number;
    bidAmount: number;
    nominatingTeamId?: number;
}

function parseArgs() {
    const args = process.argv.slice(2);
    const get = (flag: string) => {
        const i = args.indexOf(flag);
        return i >= 0 ? args[i + 1] : undefined;
    };
    const league = get('--league');
    if (!league) {
        console.error('Usage: poll-draft.ts --league <id> [--season 2026] [--interval 5000]');
        process.exit(1);
    }
    return {
        league,
        season: get('--season') ?? '2026',
        interval: Number(get('--interval') ?? 5000),
    };
}

// Minimal .env.local fallback so the script runs without exporting anything.
function envOrDotenv(name: string): string | undefined {
    if (process.env[name]) return process.env[name];
    try {
        const line = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
            .split('\n')
            .find(l => l.startsWith(`${name}=`));
        return line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '') || undefined;
    } catch {
        return undefined;
    }
}

function cookies(): string | undefined {
    const swid = envOrDotenv('ESPN_SWID');
    const s2 = envOrDotenv('ESPN_S2');
    if (!swid || !s2) return undefined;
    return `SWID=${swid}; espn_s2=${s2}`;
}

async function main() {
    const { league, season, interval } = parseArgs();
    const url = `${BASE}${season}/segments/0/leagues/${league}?view=mDraftDetail`;
    const cookie = cookies();

    const outDir = path.join(process.cwd(), 'draft-captures');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${league}-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    const write = (obj: unknown) => fs.appendFileSync(outFile, JSON.stringify(obj) + '\n');

    console.log(`Polling ${url}`);
    console.log(`Auth cookies: ${cookie ? 'yes' : 'NO (public leagues only)'}`);
    console.log(`Capture file: ${outFile}`);

    // ESPN pre-creates the full pick skeleton (playerId -1, bidAmount 0)
    // before the draft and fills slots in place, so change detection must
    // compare pick content, not pick count.
    const seen = new Map<number, string>(); // overallPickNumber -> serialized pick
    let lastFlags = '';
    let lastChangeAt = Date.now();
    let lastHeartbeat = 0;

    for (;;) {
        const ts = new Date().toISOString();
        const t0 = Date.now();
        try {
            const res = await fetch(url, { headers: cookie ? { Cookie: cookie } : {} });
            const ms = Date.now() - t0;
            const body = res.ok ? await res.json() : await res.text();
            const detail = res.ok ? (body as any).draftDetail : undefined;
            const picks: RawPick[] = detail?.picks ?? [];
            const flags = JSON.stringify({ drafted: detail?.drafted, inProgress: detail?.inProgress });

            const filled = picks.filter(p => p.playerId !== -1);
            write({ ts, ms, status: res.status, ...JSON.parse(flags), pickCount: picks.length, filledCount: filled.length });

            const changedPicks = filled.filter(p => seen.get(p.overallPickNumber) !== JSON.stringify(p));
            if (changedPicks.length > 0 || flags !== lastFlags) {
                write({ ts, event: 'change', sinceLastChangeMs: Date.now() - lastChangeAt, body });
                for (const p of changedPicks) {
                    console.log(`${ts} pick #${p.overallPickNumber}: player ${p.playerId} -> team ${p.teamId} for $${p.bidAmount}`);
                    seen.set(p.overallPickNumber, JSON.stringify(p));
                }
                if (flags !== lastFlags) console.log(`${ts} flags: ${flags}`);
                lastFlags = flags;
                lastChangeAt = Date.now();
            } else if (Date.now() - lastHeartbeat > 30_000) {
                console.log(`${ts} no change (status ${res.status}, ${filled.length}/${picks.length} picks filled, ${ms}ms)`);
                lastHeartbeat = Date.now();
            }
            if (!res.ok) console.error(`${ts} HTTP ${res.status}: ${String(body).slice(0, 200)}`);
        } catch (err) {
            write({ ts, error: String(err) });
            console.error(`${ts} poll failed:`, err);
        }
        await new Promise(r => setTimeout(r, interval));
    }
}

main();
