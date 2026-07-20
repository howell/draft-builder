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
 *
 * Outputs next to the HAR: <har>.events.jsonl (one parsed frame per line)
 * and <har>.lots.json (reconstructed lots).
 */

import fs from 'fs';
import { parseDraftSocketFrame, reconstructLots, DraftSocketEvent } from '../src/platforms/espn/liveDraftProtocol';

function arg(flag: string): string | undefined {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const harPath = arg('--har');
if (!harPath) {
    console.error('Usage: parse-draft-har.ts --har <file.har> [--rest <poll-capture.jsonl>]');
    process.exit(1);
}

interface HarWsMessage { type: 'send' | 'receive'; time: number; data: string }

const har = JSON.parse(fs.readFileSync(harPath, 'utf8'));
const sockets = (har.log.entries as any[]).filter(e =>
    e._webSocketMessages && e.request.url.includes('fantasydraft.espn.com'));
if (sockets.length === 0) {
    console.error('No fantasydraft.espn.com WebSocket found in HAR.');
    process.exit(1);
}

const events: { ts: string; atMs: number; dir: string; event: DraftSocketEvent }[] = [];
for (const socket of sockets) {
    for (const m of socket._webSocketMessages as HarWsMessage[]) {
        const atMs = Math.round(m.time * 1000);
        events.push({ ts: new Date(atMs).toISOString(), atMs, dir: m.type, event: parseDraftSocketFrame(m.data) });
    }
}
events.sort((a, b) => a.atMs - b.atMs);

const eventsPath = harPath.replace(/\.har$/, '') + '.events.jsonl';
fs.writeFileSync(eventsPath, events.map(e => JSON.stringify(e)).join('\n') + '\n');

const lots = reconstructLots(events.filter(e => e.dir === 'receive'));
const lotsPath = harPath.replace(/\.har$/, '') + '.lots.json';
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
    }
}
