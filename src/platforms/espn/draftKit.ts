/**
 * Parser for ESPN fantasy football draft-kit cheat-sheet PDFs.
 *
 * These sheets are frozen preseason artifacts (unlike the fantasy API, whose
 * archived ranks drift in-season), so they are the trusted source of historical
 * platform values for live-draft backtesting. Two layouts exist:
 *
 *  - Positional sheets (NFL{yy}_CS_PPR.pdf):  `2. (27)Josh Allen, BUF$3013`
 *    → position rank 2, overall rank 27, $30, bye 13. Position itself is not
 *    printed; it's resolved later by matching the name against the season's
 *    player list.
 *  - Overall sheets (NFL{yy}_CS_Super.pdf):   `1. (QB1)Patrick Mahomes, KC$5910`
 *    → overall rank 1, position QB, position rank 1, $59, bye 10.
 *
 * Extracted text interleaves the page's columns with NO delimiter between one
 * entry's trailing digits and the next entry's leading index (`KC$30101. (3)`
 * is "$30, bye 10" followed by "1. (3)"). The parser therefore consumes
 * entries sequentially and splits each digit run with a lookahead for the next
 * entry anchor; greedy value matching with no-leading-zero constraints picks
 * the correct split.
 */

export interface DraftKitEntry {
    playerName: string;
    team: string | null;
    /** 1-indexed as printed on the sheet */
    overallRank: number | null;
    /** 1-indexed as printed on the sheet */
    positionRank: number | null;
    /** only present on sheets that print it (e.g. the superflex sheet) */
    position: string | null;
    auctionValue: number | null;
    byeWeek: number | null;
}

export interface ParsedCheatSheet {
    entries: DraftKitEntry[];
    warnings: string[];
}

/**
 * One entry: `idx. (parens)Name, TM$<digits>` where <digits> is the auction
 * value immediately followed by the bye week, with NO separator before the
 * next entry's index (`KC$30101. (3)` = $30, bye 10, then `1. (3)`). The split
 * is pinned by three constraints: values have no leading zeros, every row has
 * a bye, and NFL byes only occur weeks 4-14 (true for every season this
 * parser targets). One ambiguous shape survives — digits `…x14` could be
 * ($x1, bye 4) or ($x, bye 14) — and is repaired afterwards using the team's
 * bye seen in unambiguous rows (see resolveAmbiguousByes).
 */
const BYE = '(1[0-4]|[4-9])';
/**
 * Two row shapes share the stream: `Name, TM$…` for players and the
 * positional sheets' D/ST form `Bills D/ST (Wk 1: @NYJ)$…`. Both must go
 * through ONE regex so entry adjacency is tracked correctly — the digit-split
 * repair needs to know when an entry's digits run straight into the next
 * entry's index.
 */
const ENTRY_RE = new RegExp(
    String.raw`(\d{1,3})\.\s*\(([A-Z/]*)(\d{1,3})\)\s*(?:([^,$()]+?),\s*([A-Za-z]{2,3})|([^,$()]*?D\/ST)\s*\(Wk[^)]*\))\s*\$(0|[1-9]\d?)${BYE}(?=\s*[1-9]\d{0,2}\.\s*\(|\s|$)`,
    'g'
);

/** Per-entry parse metadata needed by the digit-split repair pass. */
interface EntryMeta {
    /** the digits consumed after `$` (value + bye as the regex split them) */
    digitRun: string;
    /** the next main-stream entry starts immediately after this one */
    adjacentNext: boolean;
    /** which field the printed leading index landed in */
    leadingIsOverall: boolean;
}

export function parseCheatSheetText(text: string): ParsedCheatSheet {
    const mains: DraftKitEntry[] = [];
    const metas: EntryMeta[] = [];
    const warnings: string[] = [];

    // Anything between entries is sheet chrome (titles, page footers) or an
    // entry we failed to parse — surface it for validation.
    const handleSkipped = (segment: string) => {
        const trimmed = segment.trim();
        if (trimmed.length > 2) {
            warnings.push(`Skipped unparseable segment: "${trimmed.slice(0, 60)}"`);
        }
    };

    let match: RegExpExecArray | null;
    let lastEnd = 0;
    ENTRY_RE.lastIndex = 0;
    while ((match = ENTRY_RE.exec(text)) !== null) {
        if (metas.length > 0 && match.index === lastEnd) {
            metas[metas.length - 1].adjacentNext = true;
        }
        handleSkipped(text.slice(lastEnd, match.index));
        lastEnd = ENTRY_RE.lastIndex;

        const [, index, parenLetters, parenDigits, name, team, dstName, value, bye] = match;
        const positional = parenLetters.length === 0; // `(27)` vs `(QB1)`
        const isDst = dstName !== undefined;
        mains.push({
            playerName: (isDst ? dstName : name).replace(/\s+/g, ' ').trim(),
            team: isDst ? null : team.toUpperCase(),
            overallRank: positional ? Number(parenDigits) : Number(index),
            positionRank: positional ? Number(index) : Number(parenDigits),
            position: isDst ? 'DST' : positional ? null : parenLetters.replace(/\//g, ''),
            auctionValue: Number(value),
            byeWeek: bye !== undefined ? Number(bye) : null,
        });
        metas.push({
            digitRun: value + (bye ?? ''),
            adjacentNext: false,
            leadingIsOverall: !positional,
        });
    }
    handleSkipped(text.slice(lastEnd));
    repairDigitSplits(mains, metas, warnings);

    return { entries: mains, warnings };
}

interface SplitCandidate {
    value: number;
    bye: number;
    /** digits that belong to the NEXT entry's printed index */
    leftover: string;
}

/** All readings of a `$` digit run as value + bye (+ digits owed to the next index). */
function splitCandidates(run: string, allowLeftover: boolean): SplitCandidate[] {
    const out: SplitCandidate[] = [];
    for (let valueLen = 1; valueLen <= Math.min(2, run.length - 1); valueLen++) {
        const valueStr = run.slice(0, valueLen);
        if (valueLen === 2 && valueStr[0] === '0') continue;
        for (let byeLen = 1; byeLen <= 2 && valueLen + byeLen <= run.length; byeLen++) {
            const byeStr = run.slice(valueLen, valueLen + byeLen);
            if (byeStr[0] === '0') continue;
            const bye = Number(byeStr);
            if (bye < 4 || bye > 14) continue;
            const leftover = run.slice(valueLen + byeLen);
            if (leftover.length > 0 && (!allowLeftover || leftover.length > 2 || leftover[0] === '0')) {
                continue;
            }
            out.push({ value: Number(valueStr), bye, leftover });
        }
    }
    return out;
}

/** A genuine value this much above every better-ranked value is implausible. */
const MONOTONIC_SLACK = 6;

/**
 * The regex commits to the value-greedy reading of each `$` digit run, but a
 * run like `9846. (137)` is really "$9, bye 8" with the "4" belonging to the
 * next column's index "46" — greedy reads it as "$98, bye 4, next index 6".
 * Every reading is enumerated and resolved with two structural facts:
 *  1. a team's bye week is constant across the sheet (learned from rows with
 *     only one reading), and
 *  2. values are near-monotone in overall rank, so a candidate value far above
 *     every better-ranked resolved value is wrong.
 * When a non-greedy reading wins, its leftover digits are prepended to the
 * next entry's printed index (position rank on positional sheets).
 */
function repairDigitSplits(
    mains: DraftKitEntry[],
    metas: EntryMeta[],
    warnings: string[]
): void {
    const candidates = mains.map((_entry, i) =>
        splitCandidates(metas[i].digitRun, metas[i].adjacentNext)
    );

    // Byes from structurally unambiguous rows.
    const byeByTeam: Record<string, number> = {};
    for (let i = 0; i < mains.length; i++) {
        if (candidates[i].length === 1 && mains[i].team) {
            byeByTeam[mains[i].team!] = candidates[i][0].bye;
        }
    }
    for (let i = 0; i < mains.length; i++) {
        if (candidates[i].length < 2) continue;
        const knownBye = mains[i].team ? byeByTeam[mains[i].team!] : undefined;
        if (knownBye === undefined) continue;
        const matching = candidates[i].filter(c => c.bye === knownBye);
        if (matching.length > 0) candidates[i] = matching;
    }

    // Near-monotone values: bound each rank by its closest better-ranked
    // resolved values. A local window (not a global minimum) keeps $0 sidebar
    // rows — superflex K/DST sections carry section-local "ranks" — from
    // collapsing the bound for the whole sheet.
    const resolvedByRank = mains
        .map((entry, i) => ({ rank: entry.overallRank, value: candidates[i].length === 1 ? candidates[i][0].value : null }))
        .filter((r): r is { rank: number; value: number } => r.rank !== null && r.value !== null)
        .sort((a, b) => a.rank - b.rank);
    const boundAtRank = (rank: number): number => {
        const better: number[] = [];
        for (const r of resolvedByRank) {
            if (r.rank >= rank) break;
            better.push(r.value);
        }
        const window = better.slice(-5);
        return window.length > 0 ? Math.min(...window) : Infinity;
    };
    for (let i = 0; i < mains.length; i++) {
        if (candidates[i].length < 2 || mains[i].overallRank === null) continue;
        const bound = boundAtRank(mains[i].overallRank!) + MONOTONIC_SLACK;
        const plausible = candidates[i].filter(c => c.value <= bound);
        if (plausible.length > 0) candidates[i] = plausible;
    }

    // Apply: prefer the greedy (no-leftover) reading among what's left.
    for (let i = 0; i < mains.length; i++) {
        const pool = candidates[i];
        if (pool.length === 0) continue; // keep the regex reading
        const chosen = pool.find(c => c.leftover === '') ?? pool[0];
        if (pool.length > 1 && new Set(pool.map(c => c.value)).size > 1) {
            warnings.push(
                `Ambiguous value for "${mains[i].playerName}": kept $${chosen.value} bye ${chosen.bye}`
            );
        }
        mains[i].auctionValue = chosen.value;
        mains[i].byeWeek = chosen.bye;
        if (chosen.leftover !== '' && i + 1 < mains.length) {
            const next = mains[i + 1];
            const field = metas[i + 1].leadingIsOverall ? 'overallRank' : 'positionRank';
            next[field] = Number(chosen.leftover + String(next[field] ?? ''));
        }
    }
}

/** Normalized form used to compare player names across the kit and the API. */
export function normalizePlayerName(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?\s*$/i, '')
        .replace(/[^a-z0-9]/g, '');
}

/**
 * Sheets repeat players: positional sheets in FLEX sections (same overall
 * rank), the superflex sheet in K/DST sidebars whose section-local indices
 * masquerade as overall ranks. Keep one row per player — highest value, and
 * on ties the HIGHER overall rank, which is the main-list rank rather than a
 * sidebar's local index.
 */
export function dedupeEntries(entries: DraftKitEntry[]): DraftKitEntry[] {
    const byName = new Map<string, DraftKitEntry>();
    for (const entry of entries) {
        const key = normalizePlayerName(entry.playerName);
        const existing = byName.get(key);
        if (
            !existing ||
            (entry.auctionValue ?? -1) > (existing.auctionValue ?? -1) ||
            ((entry.auctionValue ?? -1) === (existing.auctionValue ?? -1) &&
                (entry.overallRank ?? -1) > (existing.overallRank ?? -1))
        ) {
            byName.set(key, entry);
        }
    }
    return Array.from(byName.values());
}

/**
 * Superflex-sheet K/DST sidebars use section-local indices that parse as
 * overall ranks and collide with the real top of the board (a "rank 1" kicker
 * vs the actual #1 player). Within a collision group, the row whose value
 * matches the rank keeps it; the cheap sidebar rows lose their rank rather
 * than poison the ordering. Returns how many ranks were nulled.
 */
export function resolveRankCollisions(entries: DraftKitEntry[]): number {
    const byRank = new Map<number, DraftKitEntry[]>();
    for (const entry of entries) {
        if (entry.overallRank === null) continue;
        const group = byRank.get(entry.overallRank);
        if (group) group.push(entry);
        else byRank.set(entry.overallRank, [entry]);
    }
    let nulled = 0;
    for (const group of byRank.values()) {
        if (group.length < 2) continue;
        const keeper = group.reduce((a, b) =>
            (b.auctionValue ?? -1) > (a.auctionValue ?? -1) ? b : a
        );
        for (const entry of group) {
            if (entry !== keeper) {
                entry.overallRank = null;
                nulled += 1;
            }
        }
    }
    return nulled;
}

export interface CheatSheetAnchor {
    /** substring of the expected player name (case-insensitive) */
    playerName: string;
    auctionValue: number;
}

/**
 * Sanity-check a parsed sheet before anything gets persisted. Throws on
 * structural problems; returns warnings for soft ones.
 */
export function validateCheatSheet(
    parsed: ParsedCheatSheet,
    options: { anchors?: CheatSheetAnchor[]; minEntries?: number } = {}
): string[] {
    const { entries, warnings } = parsed;
    const minEntries = options.minEntries ?? 150;

    if (entries.length < minEntries) {
        throw new Error(`Parsed only ${entries.length} entries (expected >= ${minEntries})`);
    }

    const overallRanks = entries
        .map(e => e.overallRank)
        .filter((r): r is number => r !== null);
    const uniqueRanks = new Set(overallRanks);
    if (uniqueRanks.size < overallRanks.length * 0.98) {
        throw new Error(
            `Overall ranks are not unique (${uniqueRanks.size} unique of ${overallRanks.length})`
        );
    }

    for (const anchor of options.anchors ?? []) {
        const entry = entries.find(e =>
            e.playerName.toLowerCase().includes(anchor.playerName.toLowerCase())
        );
        if (!entry) {
            throw new Error(`Anchor player "${anchor.playerName}" not found in sheet`);
        }
        if (entry.auctionValue !== anchor.auctionValue) {
            throw new Error(
                `Anchor mismatch for "${anchor.playerName}": parsed $${entry.auctionValue}, expected $${anchor.auctionValue}`
            );
        }
    }

    return warnings;
}

/**
 * Extract raw text from PDF bytes. pdf-parse is lazily imported so test code
 * exercising the pure parser never loads it (and it stays out of any bundle).
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
    const pdfParse = (await import('pdf-parse')).default;
    const result = await pdfParse(buffer);
    return result.text;
}
