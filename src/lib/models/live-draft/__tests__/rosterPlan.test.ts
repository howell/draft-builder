/**
 * Reconciliation tests: locked picks claim slots ahead of the plan, planned
 * entries survive by consuming/shifting/dropping deterministically, sniped
 * players stay visible but stop costing money, and the whole thing is a
 * fixed point over its own output.
 */

import { LiveBoardPick } from '../liveBoard';
import {
    firstOpenSlotFor,
    PlannerPlayer,
    PlanSelections,
    reconcileRosterPlan,
    RosterPlanInput,
    RosterPlanRowLocked,
    RosterPlanRowPlanned,
    serializePlanSlot,
} from '../rosterPlan';
import { RosterSlot } from '@/types/storage';

// {QB:1, RB:2, WR:2, 'RB/WR/TE':1, Bench:2} in lineup order — 8 slots.
const SLOTS: RosterSlot[] = [
    { position: 'QB', index: 0 },
    { position: 'RB', index: 0 },
    { position: 'RB', index: 1 },
    { position: 'WR', index: 0 },
    { position: 'WR', index: 1 },
    { position: 'RB/WR/TE', index: 0 },
    { position: 'Bench', index: 0 },
    { position: 'Bench', index: 1 },
];

const FLEXABLE = ['RB', 'WR'];

function mkPlayer(id: string, position: string, overallRank = 10): PlannerPlayer {
    const positions = FLEXABLE.includes(position)
        ? [position, 'RB/WR/TE', 'Bench']
        : [position, 'Bench'];
    return {
        id,
        name: `Player ${id}`,
        defaultPosition: position,
        positions,
        overallRank,
        positionRank: 0,
    };
}

const POOL_PLAYERS = [
    mkPlayer('qb1', 'QB', 1),
    mkPlayer('rb1', 'RB', 2),
    mkPlayer('rb2', 'RB', 3),
    mkPlayer('rb3', 'RB', 4),
    mkPlayer('rb4', 'RB', 5),
    mkPlayer('rb5', 'RB', 6),
    mkPlayer('wr1', 'WR', 7),
    mkPlayer('wr2', 'WR', 8),
    mkPlayer('wr3', 'WR', 9),
];
const POOL = new Map(POOL_PLAYERS.map(p => [p.id, p]));

const ESTIMATES: Record<string, number> = {
    qb1: 10, rb1: 40, rb2: 30, rb3: 20, rb4: 12, rb5: 8, wr1: 35, wr2: 25, wr3: 15,
};
const estimate = (p: PlannerPlayer) => ESTIMATES[p.id] ?? 5;

function mkPick(playerId: string, teamId: string, price: number, pickNumber: number): LiveBoardPick {
    const pooled = POOL.get(playerId);
    return {
        player: pooled
            ? { id: pooled.id, name: pooled.name, defaultPosition: pooled.defaultPosition,
                overallRank: pooled.overallRank, positionRank: pooled.positionRank }
            : { id: playerId, defaultPosition: 'UNK', overallRank: 999, positionRank: 999 },
        teamId,
        price,
        pickNumber,
    };
}

function run(overrides: Partial<RosterPlanInput> = {}) {
    return reconcileRosterPlan({
        slots: SLOTS,
        picks: [],
        myTeamId: '1',
        selections: {},
        pool: POOL,
        estimate,
        budget: 200,
        ...overrides,
    });
}

const sel = (playerId: string, delta = 0) => ({ playerId, delta });
const key = (position: string, index: number) => serializePlanSlot({ position, index });

describe('reconcileRosterPlan', () => {
    it('yields all-empty rows and full reserve on an empty board', () => {
        const result = run();
        expect(result.rows.every(r => r.kind === 'empty')).toBe(true);
        expect(result.budget).toMatchObject({
            lockedSpend: 0, plannedSpend: 0, reserve: 8, totalCommitted: 8,
            remaining: 200, openSlots: 8, maxBid: 193, overBudget: false,
        });
    });

    it('auto-assigns locked picks: position slots, then flex, then bench, then overflow', () => {
        const result = run({
            picks: [
                mkPick('rb1', '1', 40, 1),
                mkPick('rb2', '1', 30, 2),
                mkPick('rb3', '1', 20, 3),
                mkPick('rb4', '1', 12, 4),
                mkPick('rb5', '1', 8, 5),
            ],
        });
        const lockedSlots = result.rows
            .filter((r): r is RosterPlanRowLocked => r.kind === 'locked')
            .map(r => [r.pick.player.id, serializePlanSlot(r.slot), r.overflow]);
        expect(lockedSlots).toEqual([
            ['rb1', 'RB#0', false],
            ['rb2', 'RB#1', false],
            ['rb3', 'RB/WR/TE#0', false],
            ['rb4', 'Bench#0', false],
            ['rb5', 'Bench#1', false],
        ]);
        expect(result.budget.lockedSpend).toBe(110);
        expect(result.budget.openSlots).toBe(3);

        // A sixth RB has nowhere to go: overflow, still counted in spend.
        const sixth = run({
            picks: [
                mkPick('rb1', '1', 40, 1), mkPick('rb2', '1', 30, 2), mkPick('rb3', '1', 20, 3),
                mkPick('rb4', '1', 12, 4), mkPick('rb5', '1', 8, 5),
                mkPick('wr1', '1', 35, 6), mkPick('wr2', '1', 25, 7), mkPick('wr3', '1', 15, 8),
                mkPick('qb1', '1', 10, 9),
            ],
        });
        // 8 slots filled (5 RB + 3 WR... wr3 lands where?): QB slot goes to qb1.
        const overflowRows = sixth.rows.filter(r => r.kind === 'locked' && r.overflow);
        expect(overflowRows).toHaveLength(1);
        expect(sixth.budget.lockedSpend).toBe(195);
        expect(sixth.budget.openSlots).toBe(0);
        expect(sixth.budget.maxBid).toBe(0);
    });

    it('consumes a plan entry when I draft that player', () => {
        const result = run({
            picks: [mkPick('rb1', '1', 42, 1)],
            selections: { [key('RB', 0)]: sel('rb1', 3) },
        });
        const locked = result.rows.find(r => r.kind === 'locked') as RosterPlanRowLocked;
        expect(locked.pick.price).toBe(42);
        expect(result.effectiveSelections).toEqual({});
        expect(result.displaced).toEqual([]);
        expect(result.budget.lockedSpend).toBe(42);
        expect(result.budget.plannedSpend).toBe(0);
    });

    it('shifts a displaced entry to the next eligible slot, preserving its delta', () => {
        const result = run({
            picks: [mkPick('rb2', '1', 30, 1)], // locks RB#0
            selections: { [key('RB', 0)]: sel('rb1', 4) },
        });
        expect(result.effectiveSelections).toEqual({ [key('RB', 1)]: sel('rb1', 4) });
        const planned = result.rows.find(r => r.kind === 'planned') as RosterPlanRowPlanned;
        expect(serializePlanSlot(planned.slot)).toBe('RB#1');
        expect(planned.price).toBe(44); // 40 estimate + 4 delta
    });

    it('drops a displaced entry with no landing slot and reports it', () => {
        const result = run({
            // Lock both RB slots, flex, and both bench slots.
            picks: [
                mkPick('rb2', '1', 30, 1), mkPick('rb3', '1', 20, 2), mkPick('rb4', '1', 12, 3),
                mkPick('rb5', '1', 8, 4), mkPick('wr3', '1', 15, 5),
            ],
            // rb1 planned at RB#0 — every slot it's eligible for is now taken
            // (RB×2, flex, Bench×2 after wr3 takes WR#0... wr3 goes to WR#0, so
            // bench has one lock; rb1 can still reach Bench#1) — add one more.
            selections: { [key('RB', 0)]: sel('rb1', 2) },
        });
        // rb2→RB#0, rb3→RB#1, rb4→flex, rb5→Bench#0, wr3→WR#0; rb1 displaced
        // from RB#0 still finds Bench#1.
        expect(result.effectiveSelections).toEqual({ [key('Bench', 1)]: sel('rb1', 2) });

        // With every eligible slot locked, the entry is dropped and reported.
        const jammed = run({
            picks: [
                mkPick('rb2', '1', 30, 1), mkPick('rb3', '1', 20, 2), mkPick('rb4', '1', 12, 3),
                mkPick('rb5', '1', 8, 4), mkPick('wr1', '1', 35, 5), mkPick('wr2', '1', 25, 6),
                mkPick('wr3', '1', 15, 7),
            ],
            selections: { [key('RB', 0)]: sel('rb1', 2) },
        });
        // wr3 lands on Bench#1 (WR slots + flex taken) → rb1 has no slot.
        expect(jammed.effectiveSelections).toEqual({});
        expect(jammed.displaced).toEqual([{ playerId: 'rb1', name: 'Player rb1' }]);
    });

    it('keeps entries at open slots stable while a displaced sibling shifts around them', () => {
        const result = run({
            picks: [mkPick('rb3', '1', 20, 1)], // locks RB#0
            selections: {
                [key('RB', 0)]: sel('rb1', 1), // displaced
                [key('RB', 1)]: sel('rb2', 2), // stays put
            },
        });
        expect(result.effectiveSelections).toEqual({
            [key('RB', 1)]: sel('rb2', 2),
            [key('RB/WR/TE', 0)]: sel('rb1', 1), // shifted past the stable RB#1
        });
    });

    it('flags sniped players: retained, excluded from spend, +$1 reserve', () => {
        const result = run({
            picks: [mkPick('wr1', '9', 31, 1)],
            selections: { [key('WR', 0)]: sel('wr1', 5) },
        });
        const planned = result.rows.find(r => r.kind === 'planned') as RosterPlanRowPlanned;
        expect(planned.snipedBy).toEqual({ teamId: '9', price: 31 });
        expect(result.effectiveSelections).toEqual({ [key('WR', 0)]: sel('wr1', 5) });
        expect(result.budget.plannedSpend).toBe(0);
        expect(result.budget.reserve).toBe(8); // 7 empty + the sniped slot
    });

    it('retains pool-missing players in place but drops them when displaced', () => {
        const inPlace = run({ selections: { [key('WR', 0)]: sel('ghost', 2) } });
        const planned = inPlace.rows.find(r => r.kind === 'planned') as RosterPlanRowPlanned;
        expect(planned.player).toBeNull();
        expect(planned.price).toBeNull();
        expect(inPlace.effectiveSelections).toEqual({ [key('WR', 0)]: sel('ghost', 2) });
        expect(inPlace.budget.reserve).toBe(8);

        const displaced = run({
            picks: [mkPick('wr1', '1', 35, 1)], // locks WR#0
            selections: { [key('WR', 0)]: sel('ghost', 2) },
        });
        expect(displaced.effectiveSelections).toEqual({});
        expect(displaced.displaced).toEqual([{ playerId: 'ghost', name: undefined }]);
    });

    it('keeps only the first of a duplicated player', () => {
        const result = run({
            selections: {
                [key('RB', 0)]: sel('rb1', 1),
                [key('RB', 1)]: sel('rb1', 9),
            },
        });
        expect(result.effectiveSelections).toEqual({ [key('RB', 0)]: sel('rb1', 1) });
        expect(result.displaced).toEqual([{ playerId: 'rb1', name: 'Player rb1' }]);
    });

    it('floors planned prices at $1', () => {
        const result = run({ selections: { [key('RB', 0)]: sel('rb5', -20) } });
        const planned = result.rows.find(r => r.kind === 'planned') as RosterPlanRowPlanned;
        expect(planned.estimate).toBe(8);
        expect(planned.price).toBe(1);
    });

    it('computes the budget end to end', () => {
        const result = run({
            picks: [mkPick('rb1', '1', 45, 1), mkPick('qb1', '1', 8, 2)],
            selections: {
                [key('WR', 0)]: sel('wr1', 5),   // 35 + 5 = 40
                [key('RB', 1)]: sel('rb2', -10), // 30 - 10 = 20
            },
        });
        expect(result.budget).toEqual({
            budget: 200,
            lockedSpend: 53,
            plannedSpend: 60,
            reserve: 4, // WR#1, flex, Bench×2
            totalCommitted: 117,
            remaining: 147,
            openSlots: 6,
            maxBid: 142,
            overBudget: false,
        });
    });

    it('is a fixed point over its own effectiveSelections', () => {
        const input: RosterPlanInput = {
            slots: SLOTS,
            picks: [mkPick('rb2', '1', 30, 1), mkPick('wr1', '9', 31, 2)],
            myTeamId: '1',
            selections: {
                [key('RB', 0)]: sel('rb1', 4),   // displaced by rb2 → shifts
                [key('WR', 0)]: sel('wr1', 5),   // sniped, retained
                [key('WR', 1)]: sel('wr2', 0),
            } as PlanSelections,
            pool: POOL,
            estimate,
            budget: 200,
        };
        const first = reconcileRosterPlan(input);
        const second = reconcileRosterPlan({ ...input, selections: first.effectiveSelections });
        expect(second.effectiveSelections).toEqual(first.effectiveSelections);
        expect(second.rows).toEqual(first.rows);
        expect(second.displaced).toEqual([]);
    });

    it('locks nothing with a null team, and every pick can snipe', () => {
        const result = run({
            myTeamId: null,
            picks: [mkPick('rb1', '1', 40, 1)],
            selections: { [key('RB', 0)]: sel('rb1', 0) },
        });
        expect(result.rows.some(r => r.kind === 'locked')).toBe(false);
        const planned = result.rows.find(r => r.kind === 'planned') as RosterPlanRowPlanned;
        expect(planned.snipedBy).toEqual({ teamId: '1', price: 40 });
        expect(result.budget.lockedSpend).toBe(0);
    });

    it('re-places entries stored under unknown slot keys', () => {
        // Roster settings changed since the plan was saved.
        const result = run({ selections: { 'SUPERFLEX#0': sel('rb1', 3) } });
        expect(result.effectiveSelections).toEqual({ [key('RB', 0)]: sel('rb1', 3) });
    });
});

describe('firstOpenSlotFor', () => {
    it('prefers the exact position slot, then flex, then bench, then null', () => {
        const rowsFor = (selections: PlanSelections, picks: LiveBoardPick[] = []) =>
            run({ selections, picks }).rows;

        // Empty roster: RB lands on RB#0.
        expect(firstOpenSlotFor(rowsFor({}), POOL.get('rb1')!)).toEqual({ position: 'RB', index: 0 });

        // Both RB slots planned: flex is next.
        const rbFull = rowsFor({ [key('RB', 0)]: sel('rb2'), [key('RB', 1)]: sel('rb3') });
        expect(firstOpenSlotFor(rbFull, POOL.get('rb1')!)).toEqual({ position: 'RB/WR/TE', index: 0 });

        // Flex planned too: bench.
        const flexFull = rowsFor({
            [key('RB', 0)]: sel('rb2'),
            [key('RB', 1)]: sel('rb3'),
            [key('RB/WR/TE', 0)]: sel('rb4'),
        });
        expect(firstOpenSlotFor(flexFull, POOL.get('rb1')!)).toEqual({ position: 'Bench', index: 0 });

        // Everything the player is eligible for taken: null.
        const jammed = rowsFor({
            [key('RB', 0)]: sel('rb2'),
            [key('RB', 1)]: sel('rb3'),
            [key('RB/WR/TE', 0)]: sel('rb4'),
            [key('Bench', 0)]: sel('rb5'),
            [key('Bench', 1)]: sel('wr1'),
        });
        expect(firstOpenSlotFor(jammed, POOL.get('wr2')!)).toEqual({ position: 'WR', index: 0 });
        // QB can't take RB/WR slots — with QB#0 planned and bench full, null.
        const qbJammed = rowsFor({
            [key('QB', 0)]: sel('qb1'),
            [key('Bench', 0)]: sel('rb5'),
            [key('Bench', 1)]: sel('wr1'),
        });
        expect(firstOpenSlotFor(qbJammed, mkPlayer('qb2', 'QB'))).toBeNull();
    });
});
