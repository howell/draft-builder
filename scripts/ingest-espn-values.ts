#!/usr/bin/env ts-node
/**
 * Ingest ESPN preseason player values into the platform_player_values table.
 *
 * Two sources, two trust levels (see design-docs/features/live-draft):
 *  - Draft-kit cheat-sheet PDFs: frozen preseason artifacts. Live on ESPN's
 *    CDN for 2023+, recovered from the Wayback Machine for 2019-2022. The
 *    primary historical source.
 *  - The fantasy API's draftRanksByRankType: trustworthy only for the current
 *    (upcoming) season — archived seasons drift in-season — so it is captured
 *    as dated snapshots while drafts are still ahead.
 *
 * Raw PDFs are archived under data/espn-draft-kits/ so re-parsing never
 * depends on ESPN or Wayback again.
 *
 * Usage:
 *   npx ts-node --project scripts/tsconfig.json scripts/ingest-espn-values.ts --backfill 2019:2025
 *   npx ts-node --project scripts/tsconfig.json scripts/ingest-espn-values.ts --current
 *   Flags: --season <year> (override --current's season), --dry-run
 *
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Defaults to the local
 * `supabase start` instance when unset, so a bare run can never touch prod.
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import {
    parseCheatSheetText,
    validateCheatSheet,
    extractPdfText,
    dedupeEntries,
    normalizePlayerName,
    resolveRankCollisions,
    DraftKitEntry,
    CheatSheetAnchor,
} from '../src/platforms/espn/draftKit';
import { positionName } from '../src/platforms/espn/utils';

const ESPN_API_BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/';
const CDN_BASE = 'https://g.espncdn.com/s/ffldraftkit/';
const WAYBACK_CDX = 'https://web.archive.org/cdx/search/cdx';
const KIT_DIR = path.join(__dirname, '..', 'data', 'espn-draft-kits');

// Local supabase defaults (the well-known demo keys printed by `supabase start`).
const LOCAL_SUPABASE_URL = 'http://127.0.0.1:54321';
const LOCAL_SERVICE_ROLE_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

/** Known-correct values used to reject a silently mis-parsed sheet. */
const SHEET_ANCHORS: Record<string, CheatSheetAnchor[]> = {
    '2023:PPR': [{ playerName: 'Christian McCaffrey', auctionValue: 57 }],
    '2023:SUPERFLEX': [{ playerName: 'Patrick Mahomes', auctionValue: 59 }],
};

interface ValueRow {
    platform: 'espn';
    season: string;
    snapshot_date: string; // YYYY-MM-DD
    source: 'draft_kit_pdf' | 'api';
    rank_type: 'PPR' | 'SUPERFLEX';
    player_id: string | null;
    player_name: string;
    team: string | null;
    position: string;
    overall_rank: number | null;
    position_rank: number | null;
    auction_value: number | null;
    /** ESPN-wide live market average at snapshot time; API-source rows only */
    market_value?: number | null;
    bye_week: number | null;
}

// ---------------------------------------------------------------------------
// PDF acquisition
// ---------------------------------------------------------------------------

interface SheetSpec {
    fileName: string;
    rankType: 'PPR' | 'SUPERFLEX';
    /** undefined → resolve through Wayback */
    directUrl?: string;
}

function sheetsForYear(year: number): SheetSpec[] {
    const yy = String(year).slice(2);
    if (year >= 2023) {
        return [
            { fileName: `NFL${yy}_CS_PPR.pdf`, rankType: 'PPR', directUrl: `${CDN_BASE}${yy}/NFL${yy}_CS_PPR.pdf` },
            { fileName: `NFL${yy}_CS_Super.pdf`, rankType: 'SUPERFLEX', directUrl: `${CDN_BASE}${yy}/NFL${yy}_CS_Super.pdf` },
        ];
    }
    // 2019-2022 naming; only the PPR positional sheet is consistently archived.
    return [{ fileName: `NFLDK${year}_CS_PPR.pdf`, rankType: 'PPR' }];
}

async function fetchBuffer(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
}

/** Find the Wayback capture of a kit PDF closest to Sep 1 of its season. */
async function resolveWayback(
    year: number,
    fileName: string
): Promise<{ url: string; captureDate: string } | null> {
    const yy = String(year).slice(2);
    const original = `g.espncdn.com/s/ffldraftkit/${yy}/${fileName}`;
    const cdxUrl = `${WAYBACK_CDX}?url=${encodeURIComponent(original)}&output=json&filter=statuscode:200&collapse=timestamp:8`;
    const res = await fetch(cdxUrl);
    if (!res.ok) throw new Error(`CDX ${cdxUrl} -> ${res.status}`);
    const rows = (await res.json()) as string[][];
    const captures = rows.slice(1); // first row is the header
    if (captures.length === 0) return null;

    const target = Number(`${year}0901000000`);
    let best = captures[0];
    for (const row of captures) {
        if (Math.abs(Number(row[1]) - target) < Math.abs(Number(best[1]) - target)) {
            best = row;
        }
    }
    const ts = best[1];
    return {
        url: `https://web.archive.org/web/${ts}if_/https://${original}`,
        captureDate: `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`,
    };
}

/**
 * Get a sheet's PDF bytes, preferring the local archive; on a network fetch,
 * archive the bytes for next time. Returns null when the sheet can't be found.
 */
async function getSheetPdf(
    year: number,
    spec: SheetSpec
): Promise<{ buffer: Buffer; snapshotDate: string } | null> {
    const yearDir = path.join(KIT_DIR, String(year));
    const localPath = path.join(yearDir, spec.fileName);
    const metaPath = `${localPath}.meta.json`;

    if (fs.existsSync(localPath)) {
        const meta = fs.existsSync(metaPath)
            ? JSON.parse(fs.readFileSync(metaPath, 'utf8'))
            : { snapshotDate: `${year}-09-01` };
        return { buffer: fs.readFileSync(localPath), snapshotDate: meta.snapshotDate };
    }

    let buffer: Buffer;
    let snapshotDate = `${year}-09-01`;
    let sourceUrl: string;
    if (spec.directUrl) {
        sourceUrl = spec.directUrl;
        buffer = await fetchBuffer(spec.directUrl);
    } else {
        const wayback = await resolveWayback(year, spec.fileName);
        if (!wayback) {
            console.warn(`  ! No Wayback capture found for ${year}/${spec.fileName}`);
            return null;
        }
        sourceUrl = wayback.url;
        snapshotDate = wayback.captureDate;
        buffer = await fetchBuffer(wayback.url);
    }

    fs.mkdirSync(yearDir, { recursive: true });
    fs.writeFileSync(localPath, buffer);
    fs.writeFileSync(metaPath, JSON.stringify({ sourceUrl, snapshotDate, fetchedAt: new Date().toISOString() }, null, 2));
    console.log(`  archived ${path.relative(process.cwd(), localPath)} (${buffer.length} bytes)`);
    return { buffer, snapshotDate };
}

// ---------------------------------------------------------------------------
// Player-ID resolution
// ---------------------------------------------------------------------------

interface SeasonPlayer {
    id: string;
    name: string;
    position: string;
    pprRank: number | null;
    pprAuctionValue: number | null;
    sfRank: number | null;
    sfAuctionValue: number | null;
    /** ESPN-wide live auction-market average; drifts daily, zeroed off-season */
    marketValue: number | null;
}

async function fetchSeasonPlayers(season: string): Promise<SeasonPlayer[]> {
    const res = await fetch(`${ESPN_API_BASE}${season}/players?view=kona_player_info`, {
        headers: { 'X-Fantasy-Filter': JSON.stringify({ players: { limit: 5000 } }) },
    });
    if (!res.ok) throw new Error(`ESPN players API for ${season} -> ${res.status}`);
    const players = (await res.json()) as any[];
    return players
        .filter(p => p && p.fullName && p.id !== undefined)
        .map(p => ({
            id: String(p.id),
            name: p.fullName as string,
            position: positionName(p.defaultPositionId),
            pprRank: p.draftRanksByRankType?.PPR?.rank ?? null,
            pprAuctionValue: p.draftRanksByRankType?.PPR?.auctionValue ?? null,
            sfRank: p.draftRanksByRankType?.SUPERFLEX?.rank ?? null,
            sfAuctionValue: p.draftRanksByRankType?.SUPERFLEX?.auctionValue ?? null,
            marketValue: p.ownership?.auctionValueAverage || null,
        }));
}

interface NameIndex {
    full: Map<string, SeasonPlayer[]>;
    /** last name → draft-relevant players; fallback for nickname/short-form
     *  mismatches like kit "Ken Walker III" vs API "Kenneth Walker III" */
    lastName: Map<string, SeasonPlayer[]>;
}

function buildNameIndex(players: SeasonPlayer[]): NameIndex {
    const full = new Map<string, SeasonPlayer[]>();
    const lastName = new Map<string, SeasonPlayer[]>();
    const push = (map: Map<string, SeasonPlayer[]>, key: string, player: SeasonPlayer) => {
        const list = map.get(key);
        if (list) list.push(player);
        else map.set(key, [player]);
    };
    for (const player of players) {
        push(full, normalizePlayerName(player.name), player);
        const draftRelevant =
            (player.pprAuctionValue ?? 0) > 0 || (player.pprRank !== null && player.pprRank <= 400);
        if (draftRelevant) {
            const tokens = player.name.replace(/\b(jr|sr|ii|iii|iv|v)\b\.?\s*$/i, '').trim().split(/\s+/);
            push(lastName, normalizePlayerName(tokens[tokens.length - 1]), player);
        }
    }
    return { full, lastName };
}

const FANTASY_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'D/ST']);

function resolvePlayerId(
    entry: DraftKitEntry,
    nameIndex: NameIndex
): { id: string | null; position: string | null } {
    let pool = nameIndex.full.get(normalizePlayerName(entry.playerName)) ?? [];
    if (pool.length === 0) {
        // Fallback: last-name match among draft-relevant players, narrowed by
        // first-name prefix ("Ken" kit vs "Kenneth" API). Must end unique.
        const tokens = entry.playerName.replace(/\b(jr|sr|ii|iii|iv|v)\b\.?\s*$/i, '').trim().split(/\s+/);
        const first = normalizePlayerName(tokens[0]);
        let byLast = nameIndex.lastName.get(normalizePlayerName(tokens[tokens.length - 1])) ?? [];
        if (byLast.length > 1 && first.length > 1) {
            byLast = byLast.filter(c => {
                const candidateFirst = normalizePlayerName(c.name.split(/\s+/)[0]);
                return candidateFirst.startsWith(first) || first.startsWith(candidateFirst);
            });
        }
        if (byLast.length !== 1) return { id: null, position: null };
        pool = byLast;
    }
    if (entry.position) {
        const positionMatched = pool.filter(c => c.position.replace(/\//g, '') === entry.position);
        if (positionMatched.length > 0) pool = positionMatched;
    }
    if (pool.length > 1) {
        const fantasy = pool.filter(c => FANTASY_POSITIONS.has(c.position));
        if (fantasy.length > 0) pool = fantasy;
    }
    return { id: pool[0].id, position: pool[0].position };
}

// ---------------------------------------------------------------------------
// Row assembly
// ---------------------------------------------------------------------------

function rowsFromSheet(
    season: string,
    snapshotDate: string,
    rankType: 'PPR' | 'SUPERFLEX',
    entries: DraftKitEntry[],
    nameIndex: NameIndex
): { rows: ValueRow[]; unmatched: string[] } {
    const unmatched: string[] = [];
    const rows = entries.map(entry => {
        const resolved = resolvePlayerId(entry, nameIndex);
        if (!resolved.id) unmatched.push(entry.playerName);
        return {
            platform: 'espn' as const,
            season,
            snapshot_date: snapshotDate,
            source: 'draft_kit_pdf' as const,
            rank_type: rankType,
            player_id: resolved.id,
            player_name: entry.playerName,
            team: entry.team,
            position: resolved.position ?? entry.position ?? 'UNKNOWN',
            overall_rank: entry.overallRank,
            position_rank: entry.positionRank,
            auction_value: entry.auctionValue,
            bye_week: entry.byeWeek,
        };
    });
    return { rows, unmatched };
}

/**
 * Current-season values straight from the API's draft ranks — one snapshot
 * per published rank type (PPR + SUPERFLEX), each carrying the ESPN-wide
 * live market average so draft-day market state survives the off-season
 * zeroing (the draft room's sticker is market-based and unrecoverable
 * after the draft otherwise).
 */
function rowsFromApi(season: string, players: SeasonPlayer[]): ValueRow[] {
    const today = new Date().toISOString().slice(0, 10);

    const rowsFor = (
        rankType: 'PPR' | 'SUPERFLEX',
        rankOf: (p: SeasonPlayer) => number | null,
        valueOf: (p: SeasonPlayer) => number | null
    ): ValueRow[] => {
        const ranked = players
            .filter(p => rankOf(p) !== null && rankOf(p)! > 0)
            .filter(p => (valueOf(p) ?? 0) > 0 || rankOf(p)! <= 400)
            .sort((a, b) => rankOf(a)! - rankOf(b)!);

        const positionCounters: Record<string, number> = {};
        return ranked.map(p => {
            positionCounters[p.position] = (positionCounters[p.position] ?? 0) + 1;
            return {
                platform: 'espn' as const,
                season,
                snapshot_date: today,
                source: 'api' as const,
                rank_type: rankType,
                player_id: p.id,
                player_name: p.name,
                team: null,
                position: p.position,
                overall_rank: rankOf(p),
                position_rank: positionCounters[p.position],
                auction_value: valueOf(p),
                market_value: p.marketValue,
                bye_week: null,
            };
        });
    };

    return [
        ...rowsFor('PPR', p => p.pprRank, p => p.pprAuctionValue),
        ...rowsFor('SUPERFLEX', p => p.sfRank, p => p.sfAuctionValue),
    ];
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function supabaseClient() {
    const url = process.env.SUPABASE_URL ?? LOCAL_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_ROLE_KEY;
    if (!process.env.SUPABASE_URL) {
        console.log('SUPABASE_URL not set — writing to the LOCAL supabase instance');
    }
    try {
        new URL(url);
    } catch {
        // Say which env var is broken — supabase-js's bare "Invalid URL" cost
        // us a month of green-but-failing ingest runs.
        throw new Error(
            `SUPABASE_URL is not a valid URL (need the scheme too, e.g. https://<project-ref>.supabase.co), got: ${JSON.stringify(url)}`
        );
    }
    return createClient(url, key);
}

async function upsertRows(rows: ValueRow[], dryRun: boolean): Promise<void> {
    if (dryRun) {
        console.log(`  [dry-run] would upsert ${rows.length} rows`);
        return;
    }
    const client = supabaseClient();
    for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await client
            .from('platform_player_values')
            .upsert(chunk, { onConflict: 'platform,season,snapshot_date,source,rank_type,player_name' });
        if (error) throw new Error(`Upsert failed: ${error.message}`);
    }
    console.log(`  upserted ${rows.length} rows`);
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

async function ingestSeasonKits(year: number, dryRun: boolean): Promise<void> {
    console.log(`Season ${year} (draft-kit PDFs):`);
    const nameIndex = buildNameIndex(await fetchSeasonPlayers(String(year)));

    for (const spec of sheetsForYear(year)) {
        const pdf = await getSheetPdf(year, spec);
        if (!pdf) continue;

        const parsed = parseCheatSheetText(await extractPdfText(pdf.buffer));
        // Dedupe before validating: secondary sections (FLEX, K/DST sidebars)
        // legitimately repeat players, and the kept main-list rows must have
        // unique overall ranks.
        const entries = dedupeEntries(parsed.entries);
        const nulledRanks = resolveRankCollisions(entries);
        if (nulledRanks > 0) {
            console.log(`  nulled ${nulledRanks} colliding sidebar overall ranks`);
        }
        const warnings = validateCheatSheet(
            { entries, warnings: parsed.warnings },
            { anchors: SHEET_ANCHORS[`${year}:${spec.rankType}`] }
        );
        for (const warning of warnings) console.warn(`  ! ${warning}`);

        const { rows, unmatched } = rowsFromSheet(
            String(year),
            pdf.snapshotDate,
            spec.rankType,
            entries,
            nameIndex
        );
        console.log(
            `  ${spec.fileName}: ${rows.length} players, ${unmatched.length} without an ESPN id` +
                (unmatched.length > 0 ? ` (${unmatched.slice(0, 5).join(', ')}…)` : '')
        );
        await upsertRows(rows, dryRun);
    }
}

async function ingestCurrentSeason(season: string, dryRun: boolean): Promise<void> {
    console.log(`Season ${season} (API snapshot):`);
    const players = await fetchSeasonPlayers(season);
    const rows = rowsFromApi(season, players);
    if (rows.length < 100) {
        throw new Error(
            `Only ${rows.length} ranked players returned for ${season} — refusing to snapshot`
        );
    }
    const valued = rows.filter(r => (r.auction_value ?? 0) > 0).length;
    console.log(`  ${rows.length} ranked players (${valued} with auction values)`);
    await upsertRows(rows, dryRun);
}

/** The season whose draft is next: year N covers Aug N – Jan N+1. */
function upcomingSeason(): string {
    const now = new Date();
    return String(now.getMonth() + 1 >= 3 ? now.getFullYear() : now.getFullYear() - 1);
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const backfillArg = args[args.indexOf('--backfill') + 1];
    const seasonArg = args.includes('--season') ? args[args.indexOf('--season') + 1] : null;

    if (args.includes('--backfill')) {
        const [from, to] = backfillArg.split(':').map(Number);
        if (!from || !to || from > to) throw new Error(`Bad --backfill range: ${backfillArg}`);
        for (let year = from; year <= to; year++) {
            await ingestSeasonKits(year, dryRun);
        }
    }

    if (args.includes('--current') || seasonArg) {
        await ingestCurrentSeason(seasonArg ?? upcomingSeason(), dryRun);
    }

    if (!args.includes('--backfill') && !args.includes('--current') && !seasonArg) {
        console.log('Nothing to do. Use --backfill <from>:<to> and/or --current [--season YYYY] [--dry-run]');
    }
}

main().catch(err => {
    console.error('Ingest failed:', err);
    process.exit(1);
});
