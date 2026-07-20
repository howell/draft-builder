#!/usr/bin/env ts-node
/**
 * Parse a DevTools HAR export of an ESPN draft room into a structured event
 * log, reconstruct auction lots, and (optionally) cross-validate the decoded
 * grammar against the league API's post-draft mDraftDetail flush captured by
 * scripts/poll-draft.ts.
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/parse-draft-har.ts \
 *     --har draft-captures/<file>.har [--rest draft-captures/<file>.jsonl]
 *   npx ts-node --project scripts/tsconfig.json scripts/parse-draft-har.ts \
 *     --frames <file>.frames.jsonl [--rest ...]     # userscript tap capture
 *
 * Outputs next to the input: <name>.events.jsonl (one parsed frame per line)
 * and <name>.lots.json (reconstructed lots).
 */

import fs from 'fs';
import { parseDraftSocketFrame, parseInitBlob, reconstructLots, DraftSocketEvent } from '../src/platforms/espn/liveDraftProtocol';

function arg(flag: string): string | undefined {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const harPath = arg('--har');
const framesPath = arg('--frames');
const inputPath = harPath ?? framesPath;
if (!inputPath) {
    console.error('Usage: parse-draft-har.ts (--har <file.har> | --frames <tap.frames.jsonl>) [--rest <poll-capture.jsonl>]');
    process.exit(1);
}

interface HarWsMessage { type: 'send' | 'receive'; time: number; data: string }

const events: { ts: string; atMs: number; dir: string; event: DraftSocketEvent }[] = [];
if (harPath) {
    const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
    const sockets = (har.log.entries as any[]).filter(e =>
        e._webSocketMessages && e.request.url.includes('fantasydraft.espn.com'));
    if (sockets.length === 0) {
        console.error('No fantasydraft.espn.com WebSocket found in HAR.');
        process.exit(1);
    }
    for (const socket of sockets) {
        for (const m of socket._webSocketMessages as HarWsMessage[]) {
            const atMs = Math.round(m.time * 1000);
            events.push({ ts: new Date(atMs).toISOString(), atMs, dir: m.type, event: parseDraftSocketFrame(m.data) });
        }
    }
} else {
    // Userscript tap capture: JSONL of { ts, dir, data }
    for (const line of fs.readFileSync(framesPath!, 'utf8').trim().split('\n')) {
        const f = JSON.parse(line);
        events.push({ ts: f.ts, atMs: Date.parse(f.ts), dir: f.dir, event: parseDraftSocketFrame(f.data) });
    }
}
events.sort((a, b) => a.atMs - b.atMs);

const eventsPath = inputPath.replace(/\.(har|frames\.jsonl)$/, '') + '.events.jsonl';
fs.writeFileSync(eventsPath, events.map(e => JSON.stringify(e)).join('\n') + '\n');

const lots = reconstructLots(events.filter(e => e.dir === 'receive'));
const lotsPath = inputPath.replace(/\.(har|frames\.jsonl)$/, '') + '.lots.json';
fs.writeFileSync(lotsPath, JSON.stringify(lots, null, 2));

// ---- Summary ----------------------------------------------------------------

const counts: Record<string, number> = {};
for (const e of events) counts[e.event.type] = (counts[e.event.type] ?? 0) + 1;
console.log('Frames parsed:', events.length, JSON.stringify(counts));
if (counts.unknown) {
    console.log('UNKNOWN frames:');
    for (const e of events.filter(x => x.event.type === 'unknown').slice(0, 10)) console.log('  ', e.event);
}

const complete = lots.filter(l => l.price !== null);
const contested = complete.filter(l => l.biddingTeamIds.length > 1);
console.log(`Lots: ${lots.length} seen, ${complete.length} with a SOLD, ${contested.length} contested (>1 bidder)`);
console.log(`Bids per sold lot: ${(complete.reduce((s, l) => s + l.bids.length, 0) / (complete.length || 1)).toFixed(1)} avg`);
console.log(`Wrote ${eventsPath} and ${lotsPath}`);

// ---- Cross-validation vs the REST mDraftDetail flush ------------------------

const restPath = arg('--rest');
if (restPath) {
    interface RestPick {
        playerId: number; teamId: number; bidAmount: number;
        nominatingTeamId: number; lineupSlotId: number; overallPickNumber: number;
    }
    const lines = fs.readFileSync(restPath, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const flush = [...lines].reverse().find(l => l.event === 'change' && l.body?.draftDetail?.drafted);
    if (!flush) {
        console.log('\nNo completed-draft flush found in', restPath);
    } else {
        const picks: RestPick[] = flush.body.draftDetail.picks;
        let priceOk = 0, priceBad = 0, teamOk = 0, teamBad = 0, nomOk = 0, nomBad = 0, slotMatch = 0;
        let missing = 0;
        for (const pick of picks) {
            const l = complete.find(x => x.playerId === pick.playerId);
            if (!l) { missing++; continue; }
            l.price === pick.bidAmount ? priceOk++ : priceBad++;
            l.winningTeamId === pick.teamId ? teamOk++ : teamBad++;
            l.nominatingTeamId === pick.nominatingTeamId ? nomOk++ : nomBad++;
            const sold = events.find(e => e.event.type === 'sold' && e.event.playerId === pick.playerId);
            if (sold && sold.event.type === 'sold' && sold.event.unknown3 === pick.lineupSlotId) slotMatch++;
        }
        console.log(`\nCross-validation vs ${picks.length} REST picks (${missing} predate the WS capture):`);
        console.log(`  price:          ${priceOk} match, ${priceBad} mismatch`);
        console.log(`  winning team:   ${teamOk} match, ${teamBad} mismatch`);
        console.log(`  nominating team:${nomOk} match, ${nomBad} mismatch`);
        console.log(`  SOLD.unknown3 == lineupSlotId for ${slotMatch}/${picks.length - missing} matched picks`);

        // INIT blob: its completed picks are the ones that predate the WS
        // capture, so validate them field-by-field against REST.
        const initEvent = events.find(e => e.event.type === 'init');
        const tokenEvent = events.find(e => e.event.type === 'token');
        if (initEvent && initEvent.event.type === 'init' && tokenEvent && tokenEvent.event.type === 'token') {
            const init = parseInitBlob(initEvent.event.blob, Number(tokenEvent.event.leagueId));
            if (!init) {
                console.log('\nINIT blob: ledger not found');
            } else {
                let ok = 0, bad = 0, slotAgree = 0;
                for (const ip of init.completedPicks) {
                    const pick = picks.find(p => p.overallPickNumber === ip.pickNumber);
                    const match = pick && pick.playerId === ip.playerId && pick.teamId === ip.teamId
                        && pick.bidAmount === ip.price;
                    match ? ok++ : bad++;
                    if (pick && pick.lineupSlotId === ip.slotIdHint) slotAgree++;
                }
                console.log(`\nINIT blob ledger: ${init.completedPicks.length} completed + ${init.pendingPicks.length} pending slots`);
                console.log(`  completed picks vs REST (player+team+price): ${ok} match, ${bad} mismatch`);
                console.log(`  slotIdHint == final lineupSlotId for ${slotAgree}/${init.completedPicks.length} (provisional; expected to differ)`);
            }
        }
    }
}
