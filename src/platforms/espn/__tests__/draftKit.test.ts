/**
 * Tests for the ESPN draft-kit cheat-sheet parser.
 *
 * The fixtures are the pdf-parse text of the real 2023 sheets (PPR positional
 * layout and superflex overall layout), so these tests pin the live formats
 * including their nasty quirks: column interleaving with no delimiters,
 * value/bye digit-run ambiguity, and the D/ST matchup row format.
 */

import fs from 'fs';
import path from 'path';
import { parseCheatSheetText, validateCheatSheet, DraftKitEntry } from '../draftKit';

const fixture = (name: string) =>
    fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

const byName = (entries: DraftKitEntry[], name: string) =>
    entries.find(e => e.playerName.includes(name));

describe('parseCheatSheetText — 2023 PPR positional sheet', () => {
    const parsed = parseCheatSheetText(fixture('nfl23-cs-ppr.txt'));

    it('parses the whole sheet with only legend chrome skipped', () => {
        expect(parsed.entries.length).toBeGreaterThanOrEqual(250);
        const skipped = parsed.warnings.filter(w => w.startsWith('Skipped'));
        expect(skipped.length).toBeLessThanOrEqual(2);
    });

    it('keeps the greedy reading for ambiguous runs the constraints cannot settle', () => {
        // "$511180." could be ($51, bye 11, next "80") or ($5, bye 11, next
        // "180") — bye and monotonicity agree on both, so greedy wins and a
        // warning flags it. $51 is the true 2023 value.
        const bijan = byName(parsed.entries, 'Bijan Robinson')!;
        expect(bijan.auctionValue).toBe(51);
        expect(parsed.warnings.some(w => w.includes('Bijan Robinson'))).toBe(true);
    });

    it('reads ranks, values, and byes for star players', () => {
        const cmc = byName(parsed.entries, 'Christian McCaffrey')!;
        expect(cmc).toMatchObject({
            team: 'SF',
            overallRank: 4,
            positionRank: 2,
            auctionValue: 57,
            byeWeek: 9,
            position: null, // positional sheets don't print the position
        });
    });

    it('splits value/bye correctly for cheap players with two-digit byes', () => {
        // "$113" must be $1 + bye 13, not $11 + bye 3 (bye 3 doesn't exist).
        const tucker = byName(parsed.entries, 'Justin Tucker')!;
        expect(tucker.auctionValue).toBe(1);
        expect(tucker.byeWeek).toBe(13);
    });

    it('recovers D/ST rows from their matchup-style format', () => {
        const dsts = parsed.entries.filter(e => e.position === 'DST');
        expect(dsts.length).toBeGreaterThanOrEqual(10);
        const bills = byName(dsts, 'Bills D/ST')!;
        expect(bills).toMatchObject({ auctionValue: 1, byeWeek: 13, positionRank: 3 });
    });

    it('passes validation with known anchors', () => {
        expect(() =>
            validateCheatSheet(parsed, {
                anchors: [{ playerName: 'Christian McCaffrey', auctionValue: 57 }],
            })
        ).not.toThrow();
    });

    it('fails validation on an anchor mismatch', () => {
        expect(() =>
            validateCheatSheet(parsed, {
                anchors: [{ playerName: 'Christian McCaffrey', auctionValue: 99 }],
            })
        ).toThrow(/Anchor mismatch/);
    });
});

describe('parseCheatSheetText — 2023 superflex overall sheet', () => {
    const parsed = parseCheatSheetText(fixture('nfl23-cs-super.txt'));

    it('reads the printed position and both ranks', () => {
        const mahomes = byName(parsed.entries, 'Patrick Mahomes')!;
        expect(mahomes).toMatchObject({
            position: 'QB',
            overallRank: 1,
            positionRank: 1,
            auctionValue: 59,
            byeWeek: 10,
        });
    });

    it('parses a full 300-entry sheet', () => {
        expect(parsed.entries.length).toBeGreaterThanOrEqual(290);
    });
});

describe('parseCheatSheetText — synthetic edge cases', () => {
    it('handles column interleaving with no delimiter between entries', () => {
        const text = '1. (26)Patrick Mahomes, KC$30101. (3)Austin Ekeler, LAC$585';
        const { entries } = parseCheatSheetText(text);
        expect(entries).toHaveLength(2);
        expect(entries[0]).toMatchObject({ auctionValue: 30, byeWeek: 10 });
        expect(entries[1]).toMatchObject({ auctionValue: 58, byeWeek: 5 });
    });

    it('never lets a bye steal the next entry index (leading-zero rule)', () => {
        // "GB$0108. (40)" must read as $0, bye 10, then index "8. (40)" —
        // the lookahead rejects an index starting with 0, so the bye cannot
        // grab a digit that belongs to the next entry's index.
        const text = '9. (200)Some Guy, GB$0108. (40)Other Guy, KC$1212';
        const { entries } = parseCheatSheetText(text);
        expect(entries.length).toBe(2);
        expect(entries[0]).toMatchObject({ auctionValue: 0, byeWeek: 10 });
        expect(entries[1].positionRank).toBe(8);
        expect(entries[1].overallRank).toBe(40);
    });

    it('resolves the x14 value/bye ambiguity from the team bye seen elsewhere', () => {
        // Dolphins bye is 14 per the unambiguous first row, so "$114" must be
        // $1 + bye 14, not $11 + bye 4.
        const text =
            '1. (5)Star Guy, SF$6092. (10)Tyreek Hill, MIA$4514\n3. (90)Cheap Guy, MIA$114';
        const { entries, warnings } = parseCheatSheetText(text);
        const cheap = byName(entries, 'Cheap Guy')!;
        expect(cheap.auctionValue).toBe(1);
        expect(cheap.byeWeek).toBe(14);
        expect(warnings).toHaveLength(0);
    });

    it('repairs greedy splits that steal digits from the next column index', () => {
        // "BAL$9846. (137)" is $9, bye 8 (Ravens bye known from Lamar's row),
        // with the "4" belonging to the next entry's index "46".
        const text =
            '1. (2)Lamar Jackson, BAL$358\n2. (60)Mark Andrews, BAL$9846. (137)Next Guy, WAS$19';
        const { entries } = parseCheatSheetText(text);
        const andrews = byName(entries, 'Mark Andrews')!;
        expect(andrews.auctionValue).toBe(9);
        expect(andrews.byeWeek).toBe(8);
        const next = byName(entries, 'Next Guy')!;
        expect(next.positionRank).toBe(46);
        expect(next.overallRank).toBe(137);
    });

    it('rejects values that violate rank monotonicity when byes cannot decide', () => {
        // Both readings of "$91114. (222)" keep bye 11 — ($91, next "4") vs
        // ($9, next "14") — but $91 at rank 59 towers over every better-ranked
        // value, so the small reading wins.
        const text =
            '1. (1)Top Guy, SF$6292. (58)Mid Guy, CHI$10113. (59)Courtland Sutton, DEN$91114. (222)Packers D/ST (Wk 1: vs CHI)$18';
        const { entries } = parseCheatSheetText(text);
        const sutton = byName(entries, 'Courtland Sutton')!;
        expect(sutton.auctionValue).toBe(9);
        expect(sutton.byeWeek).toBe(11);
    });

    it('throws on sheets with too few entries', () => {
        const parsed = parseCheatSheetText('1. (1)Lone Player, KC$5910');
        expect(() => validateCheatSheet(parsed)).toThrow(/Parsed only/);
    });
});
