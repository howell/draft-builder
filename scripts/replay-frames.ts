#!/usr/bin/env ts-node
/**
 * Replay a captured frames JSONL (badge download or merged capture) against
 * the live-draft ingest endpoint — dry-run the game-day board without a
 * draft room.
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/replay-frames.ts \
 *     --frames draft-captures/<file>.frames.jsonl \
 *     --league <leagueId> --token <ingest token from the live-draft page> \
 *     [--url http://localhost:3000/api/live-draft-ingest] \
 *     [--delay-ms 500] [--fresh]
 *
 * --fresh remaps the captureId to a new random one so a re-replay isn't
 * deduped away by the server's (user, capture, seq) idempotency.
 * --delay-ms paces batches to simulate a live draft instead of one dump.
 */

import fs from 'fs';
import crypto from 'crypto';

function arg(flag: string): string | undefined {
    const i = process.argv.indexOf(flag);
    return i >= 0 ? process.argv[i + 1] : undefined;
}

const framesPath = arg('--frames');
const leagueId = arg('--league');
const token = arg('--token');
const url = arg('--url') ?? 'http://localhost:3000/api/live-draft-ingest';
const delayMs = Number(arg('--delay-ms') ?? 0);
const fresh = process.argv.includes('--fresh');

if (!framesPath || !leagueId || !token) {
    console.error('Usage: replay-frames.ts --frames <file.jsonl> --league <id> --token <token> [--url ...] [--delay-ms N] [--fresh]');
    process.exit(1);
}

interface Frame { captureId: string; seq: number; ts: string; dir: string; data: string }

const BATCH = 100;

async function main() {
    const frames: Frame[] = fs
        .readFileSync(framesPath!, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map(line => JSON.parse(line));

    const captureRemap = new Map<string, string>();
    if (fresh) {
        for (const f of frames) {
            if (!captureRemap.has(f.captureId)) {
                captureRemap.set(f.captureId, crypto.randomUUID());
            }
            f.captureId = captureRemap.get(f.captureId)!;
        }
        console.log(`--fresh: remapped ${captureRemap.size} capture id(s)`);
    }

    let sent = 0;
    for (let i = 0; i < frames.length; i += BATCH) {
        const batch = frames.slice(i, i + BATCH);
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                // The route only serves CORS for ESPN origins, but same-origin
                // server-to-server posts don't need it; no Origin header sent.
            },
            body: JSON.stringify({ leagueId, frames: batch }),
        });
        if (!res.ok) {
            console.error(`Batch at ${i} rejected: ${res.status} ${await res.text()}`);
            process.exit(1);
        }
        sent += batch.length;
        console.log(`sent ${sent}/${frames.length}`);
        if (delayMs > 0 && i + BATCH < frames.length) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    console.log('done');
}

main().catch(err => {
    console.error('Replay failed:', err);
    process.exit(1);
});
