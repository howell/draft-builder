/**
 * Unit tests for the inflation-decomposition model.
 *
 * The headline invariant is money conservation: prices over the players that
 * will still be drafted must sum to the money still to be spent. The second
 * key invariant is market neutrality: a draft where every pick goes at exactly
 * its baseline price must produce no positional pressure, no matter which
 * positions happened to be nominated first. We also check that the model
 * reacts in the right direction once money is genuinely over- or under-spent,
 * and that the league-history knobs (priors, expected unspent, positional
 * capacity) move the field the way they claim to.
 */

import { createBaselineModels, BaselineDraftPick } from '@/app/league/analytics';
import {
    computeInflation,
    computeInflationTimeline,
    moneySurplus,
    draftablePlayers,
    InflationPredictor,
    createPlatformValuePredictor,
    priceWithInflationField,
} from '../inflationModel';
import {
    PredictionContext,
    PredictorPlayer,
    PredictorTeam,
    baselineValue,
    BaselineModels,
} from '../predictor';

const TEAM_COUNT = 12;
const BUDGET = 200;
const ROSTER_NEEDS = { QB: 1, RB: 2, WR: 3, TE: 1, K: 1, DEF: 1 };
const ROSTER_SIZE = Object.values(ROSTER_NEEDS).reduce((a, b) => a + b, 0);
const TOTAL_SLOTS = ROSTER_SIZE * TEAM_COUNT;
const POSITIONS = Object.keys(ROSTER_NEEDS);

/** Build a plausible ranked pool whose summed value approximates the league budget. */
function buildPool(size: number): { players: PredictorPlayer[]; picks: BaselineDraftPick[] } {
    const players: PredictorPlayer[] = [];
    const picks: BaselineDraftPick[] = [];
    const positionCounters: Record<string, number> = {};
    for (let i = 0; i < size; i++) {
        const position = POSITIONS[i % POSITIONS.length];
        positionCounters[position] = (positionCounters[position] ?? 0) + 1;
        // Exponential-ish price decay by rank, floored at $1.
        const price = Math.max(1, Math.round(70 * Math.exp(-0.025 * i)));
        players.push({
            id: `p${i}`,
            defaultPosition: position,
            overallRank: i,
            positionRank: positionCounters[position] - 1,
        });
        picks.push({ price, position });
    }
    return { players, picks };
}

function makeContext(
    players: PredictorPlayer[],
    drafted: PredictorPlayer[],
    pickPrices: number[],
    overrides: Partial<PredictionContext> = {}
): PredictionContext {
    const draftedIds = new Set(drafted.map(p => p.id));
    return {
        budgetConfig: { totalBudgetPerTeam: BUDGET, teamCount: TEAM_COUNT },
        rosterSize: ROSTER_SIZE,
        rosterNeeds: ROSTER_NEEDS,
        picks: drafted.map((player, i) => ({
            player,
            price: pickPrices[i],
            teamId: `team-${(i % TEAM_COUNT) + 1}`,
            pickNumber: i + 1,
        })),
        teams: [],
        availablePlayers: players.filter(p => !draftedIds.has(p.id)),
        currentPickNumber: drafted.length + 1,
        ...overrides,
    };
}

describe('InflationModel', () => {
    const { players, picks } = buildPool(220);
    const baseline: BaselineModels = createBaselineModels(picks);

    const surplus = (v: number) => Math.max(0, v - 1);

    /** Sum of (unrounded) predicted prices over the players still to be drafted. */
    function predictedMoneyOnBoard(ctx: PredictionContext, elasticity: number): number {
        const field = computeInflation(ctx, baseline, elasticity);
        return draftablePlayers(ctx, baseline).reduce((sum, { player, value }) => {
            const inflation = field.byPosition[player.defaultPosition] ?? field.global;
            return sum + (1 + surplus(value) * inflation);
        }, 0);
    }

    it('conserves money on an empty board (global inflation)', () => {
        const ctx = makeContext(players, [], []);
        const remainingMoney = BUDGET * TEAM_COUNT;
        expect(predictedMoneyOnBoard(ctx, 0)).toBeCloseTo(remainingMoney, 4);
    });

    it('conserves money on an empty board (positional inflation)', () => {
        const ctx = makeContext(players, [], []);
        const remainingMoney = BUDGET * TEAM_COUNT;
        expect(predictedMoneyOnBoard(ctx, 1)).toBeCloseTo(remainingMoney, 4);
    });

    it('conserves money mid-draft after several picks', () => {
        const drafted = players.slice(0, 40);
        const prices = drafted.map((_, i) => Math.max(1, 60 - i)); // arbitrary realized prices
        const ctx = makeContext(players, drafted, prices);
        const spent = prices.reduce((a, b) => a + b, 0);
        const remainingMoney = BUDGET * TEAM_COUNT - spent;
        expect(predictedMoneyOnBoard(ctx, 0.5)).toBeCloseTo(remainingMoney, 3);
    });

    it('has inflation near 1.0 on a calibrated empty board', () => {
        const ctx = makeContext(players, [], []);
        const field = computeInflation(ctx, baseline, 0);
        expect(field.global).toBeGreaterThan(0.7);
        expect(field.global).toBeLessThan(1.4);
    });

    it('deflates remaining prices when the league overspends early', () => {
        const drafted = players.slice(0, 30);
        // Pay way over value -> less money left for the rest.
        const prices = drafted.map(p => baselineValue(p, baseline) * 2);
        const ctx = makeContext(players, drafted, prices);
        const field = computeInflation(ctx, baseline, 0);
        expect(field.global).toBeLessThan(1);
    });

    it('inflates remaining prices when the league underspends early', () => {
        const drafted = players.slice(0, 30);
        const prices = drafted.map(() => 1); // bargains -> lots of money left
        const ctx = makeContext(players, drafted, prices);
        const field = computeInflation(ctx, baseline, 0);
        expect(field.global).toBeGreaterThan(1);
    });

    it('produces no positional pressure in a neutral market, regardless of draft order', () => {
        // Draft position-clustered (all the top RBs first, then WRs) at *exactly*
        // baseline prices. The old spent-vs-remaining-board comparison would
        // manufacture pressure from this ordering alone; actual-vs-expected over
        // the same drafted players must not.
        const rbs = players.filter(p => p.defaultPosition === 'RB').slice(0, 10);
        const wrs = players.filter(p => p.defaultPosition === 'WR').slice(0, 6);
        const drafted = [...rbs, ...wrs];
        const prices = drafted.map(p => baselineValue(p, baseline));
        const ctx = makeContext(players, drafted, prices);
        const field = computeInflation(ctx, baseline, 1);
        for (const factor of Object.values(field.byPosition)) {
            expect(factor).toBeCloseTo(field.global, 10);
        }
    });

    it('lowers appetite for a position the market over-pays relative to others', () => {
        // Mixed market: RBs go at double value, WRs at fair value. The revealed
        // cross-position preference should dampen RB inflation below global and
        // raise WR above it.
        const rbs = players.filter(p => p.defaultPosition === 'RB').slice(0, 8);
        const wrs = players.filter(p => p.defaultPosition === 'WR').slice(0, 8);
        const drafted = [...rbs, ...wrs];
        const prices = drafted.map(p =>
            p.defaultPosition === 'RB'
                ? baselineValue(p, baseline) * 2
                : baselineValue(p, baseline)
        );
        const ctx = makeContext(players, drafted, prices);
        const field = computeInflation(ctx, baseline, 1);
        expect(field.byPosition['RB']).toBeLessThan(field.global);
        expect(field.byPosition['WR']).toBeGreaterThan(field.global);
    });

    it('caps the draftable pool at each position’s remaining league capacity', () => {
        const ctx = makeContext(players, [], []);
        const draftable = draftablePlayers(ctx, baseline);
        expect(draftable.length).toBe(TOTAL_SLOTS);
        const counts: Record<string, number> = {};
        for (const { player } of draftable) {
            counts[player.defaultPosition] = (counts[player.defaultPosition] ?? 0) + 1;
        }
        for (const pos of POSITIONS) {
            // No flex slots in ROSTER_NEEDS, so each position is hard-capped.
            expect(counts[pos]).toBe(ROSTER_NEEDS[pos as keyof typeof ROSTER_NEEDS] * TEAM_COUNT);
        }
    });

    it('excludes dead money held by teams with full rosters', () => {
        // team-1 fills its whole roster cheaply and sits on the rest of its
        // budget; that money can never be spent and must not inflate prices.
        const drafted = players.slice(0, ROSTER_SIZE);
        const prices = drafted.map(() => 10);
        const teams: PredictorTeam[] = Array.from({ length: TEAM_COUNT }, (_, i) => ({
            id: `team-${i + 1}`,
            remainingBudget: i === 0 ? BUDGET - 10 * ROSTER_SIZE : BUDGET,
            rosterNeeds: ROSTER_NEEDS,
            filledPositions: {},
        }));
        const allByTeamOne = {
            picks: drafted.map((player, i) => ({
                player,
                price: prices[i],
                teamId: 'team-1',
                pickNumber: i + 1,
            })),
        };
        const withTeams = makeContext(players, drafted, prices, { ...allByTeamOne, teams });
        const withoutTeams = makeContext(players, drafted, prices, allByTeamOne);
        const deadMoney = BUDGET - 10 * ROSTER_SIZE;
        expect(moneySurplus(withTeams)).toBeCloseTo(moneySurplus(withoutTeams) - deadMoney, 6);
        expect(computeInflation(withTeams, baseline, 0).global).toBeLessThan(
            computeInflation(withoutTeams, baseline, 0).global
        );
    });

    it('applies league positional priors on an empty board and conserves money', () => {
        const ctx = makeContext(players, [], []);
        const field = computeInflation(ctx, baseline, {
            elasticity: 1,
            priors: { RB: 1.5 },
        });
        expect(field.byPosition['RB']).toBeGreaterThan(field.global);
        expect(field.byPosition['WR']).toBeLessThan(field.global);
        // Renormalization keeps the identity intact even with priors applied.
        const total = draftablePlayers(ctx, baseline).reduce((sum, { player, value }) => {
            const inflation = field.byPosition[player.defaultPosition] ?? field.global;
            return sum + (1 + surplus(value) * inflation);
        }, 0);
        expect(total).toBeCloseTo(BUDGET * TEAM_COUNT, 4);
    });

    it('discounts money the league historically leaves unspent', () => {
        const ctx = makeContext(players, [], []);
        const withUnspent = computeInflation(ctx, baseline, {
            elasticity: 0,
            expectedUnspent: 150,
        });
        const without = computeInflation(ctx, baseline, 0);
        expect(withUnspent.global).toBeLessThan(without.global);
    });

    it('conserves money when pricing from platform values (scale-free)', () => {
        // Give every player a platform value on a DIFFERENT scale than the
        // league budget — the identity must renormalize it away.
        const platformPool = players.map(p => ({
            ...p,
            platformValue: Math.max(1, Math.round(35 * Math.exp(-0.025 * p.overallRank))),
        }));
        const ctx = makeContext(platformPool, [], []);
        const predictor = createPlatformValuePredictor(baseline);
        const options = { elasticity: 0, valueSource: 'platform' as const };
        const field = computeInflation(ctx, baseline, options);
        const total = draftablePlayers(ctx, baseline, options).reduce((sum, { player, value }) => {
            const inflation = field.byPosition[player.defaultPosition] ?? field.global;
            return sum + (1 + Math.max(0, value - 1) * inflation);
        }, 0);
        expect(total).toBeCloseTo(BUDGET * TEAM_COUNT, 4);
        // And the predictor prices the best player well above the floor.
        expect(predictor.predict(platformPool[0], ctx).price).toBeGreaterThan(20);
    });

    it('floors the final pick near $1 when only reserve money remains', () => {
        // Drain budgets so money surplus is ~0.
        const drafted = players.slice(0, TOTAL_SLOTS - 1);
        const remainingMoney = BUDGET * TEAM_COUNT - 1; // leave $1 of real money
        const perPick = remainingMoney / drafted.length;
        const prices = drafted.map(() => perPick);
        const ctx = makeContext(players, drafted, prices);
        expect(moneySurplus(ctx)).toBeLessThan(5);
        const predictor = new InflationPredictor(baseline, { elasticity: 0 });
        const lastPlayer = ctx.availablePlayers[0];
        expect(predictor.predict(lastPlayer, ctx).price).toBeLessThanOrEqual(2);
    });
});

describe('computeInflationTimeline', () => {
    const { players, picks } = buildPool(220);
    const baseline: BaselineModels = createBaselineModels(picks);
    const budgetConfig = { totalBudgetPerTeam: BUDGET, teamCount: TEAM_COUNT };

    const pickAt = (player: PredictorPlayer, price: number, pickNumber: number) => ({
        player,
        price,
        teamId: `team-${((pickNumber - 1) % TEAM_COUNT) + 1}`,
        pickNumber,
    });

    it('returns an empty timeline for an empty board', () => {
        expect(
            computeInflationTimeline([], players, budgetConfig, ROSTER_NEEDS, baseline)
        ).toEqual([]);
    });

    it('attributes overpays as negative deltas and bargains as positive', () => {
        const starValue = baselineValue(players[0], baseline);
        const overpay = [pickAt(players[0], Math.round(starValue * 2), 1)];
        const overTimeline = computeInflationTimeline(
            overpay, players, budgetConfig, ROSTER_NEEDS, baseline
        );
        expect(overTimeline[0].delta).toBeLessThan(0);

        const bargain = [pickAt(players[1], 1, 1)];
        const bargainTimeline = computeInflationTimeline(
            bargain, players, budgetConfig, ROSTER_NEEDS, baseline
        );
        expect(bargainTimeline[0].delta).toBeGreaterThan(0);
    });

    it('telescopes: deltas sum to the total inflation movement', () => {
        const board = [
            pickAt(players[0], Math.round(baselineValue(players[0], baseline) * 1.5), 1),
            pickAt(players[1], 1, 2),
            pickAt(players[2], Math.round(baselineValue(players[2], baseline)), 3),
        ];
        const timeline = computeInflationTimeline(
            board, players, budgetConfig, ROSTER_NEEDS, baseline
        );
        const summed = timeline.reduce((s, point) => s + point.delta, 0);
        const startGlobal = timeline[0].global - timeline[0].delta;
        expect(startGlobal + summed).toBeCloseTo(timeline[timeline.length - 1].global, 10);
        // Pick numbers pass through for table lookup.
        expect(timeline.map(p => p.pickNumber)).toEqual([1, 2, 3]);
    });
});

describe('blend weight', () => {
    const { players, picks } = buildPool(220);
    const baseline: BaselineModels = createBaselineModels(picks);
    // Overspend heavily so the measured inflation sits well away from 1.
    const drafted = players.slice(0, 20);
    const prices = drafted.map(p => baselineValue(p, baseline) * 2);
    const ctx = makeContext(players, drafted, prices);
    const target = ctx.availablePlayers[0];

    it('w=0 collapses to the baseline price', () => {
        const predictor = new InflationPredictor(baseline, { elasticity: 0, blend: 0 });
        expect(predictor.predict(target, ctx).price).toBe(
            Math.max(1, Math.round(baselineValue(target, baseline)))
        );
    });

    it('w=1 matches the unblended model exactly', () => {
        const full = new InflationPredictor(baseline, { elasticity: 0, blend: 1 });
        const legacy = new InflationPredictor(baseline, { elasticity: 0 });
        expect(full.predict(target, ctx).price).toBe(legacy.predict(target, ctx).price);
    });

    it('intermediate w lands between the endpoints', () => {
        const base = Math.round(baselineValue(target, baseline));
        const full = new InflationPredictor(baseline, { elasticity: 0 }).predict(target, ctx).price;
        const half = new InflationPredictor(baseline, { elasticity: 0, blend: 0.5 })
            .predict(target, ctx).price;

        // The overspent state must move prices, or this test tests nothing.
        expect(full).not.toBe(base);
        expect(half).toBeGreaterThanOrEqual(Math.min(base, full));
        expect(half).toBeLessThanOrEqual(Math.max(base, full));
    });
});

describe('computeInflationTimeline with real team ids', () => {
    const { players, picks } = buildPool(220);
    const baseline: BaselineModels = createBaselineModels(picks);
    const budgetConfig = { totalBudgetPerTeam: BUDGET, teamCount: TEAM_COUNT };

    it('tracks budgets for ESPN-style team ids exactly like the team-N default', () => {
        const board = [
            { player: players[0], price: 90, teamId: 'team-3', pickNumber: 1 },
            { player: players[1], price: 1, teamId: 'team-7', pickNumber: 2 },
            { player: players[2], price: 45, teamId: 'team-3', pickNumber: 3 },
        ];
        const espnIds = Array.from({ length: TEAM_COUNT }, (_, i) => String(i + 1));
        const espnBoard = board.map(p => ({
            ...p,
            teamId: p.teamId.replace('team-', ''),
        }));

        const legacy = computeInflationTimeline(
            board, players, budgetConfig, ROSTER_NEEDS, baseline
        );
        const espn = computeInflationTimeline(
            espnBoard, players, budgetConfig, ROSTER_NEEDS, baseline, {}, espnIds
        );

        expect(espn.map(p => p.delta)).toEqual(legacy.map(p => p.delta));
        expect(espn.map(p => p.global)).toEqual(legacy.map(p => p.global));
    });
});

describe('computeInflationTimeline modelPrice', () => {
    const { players, picks } = buildPool(220);
    const baseline: BaselineModels = createBaselineModels(picks);

    it("prices each pick with the field as of when they were on the block", () => {
        const options = { elasticity: 0.5, blend: 0.7 };
        const drafted = players.slice(0, 3);
        const completed = drafted.map((player, i) => ({
            player,
            price: 50 - i * 10,
            teamId: `team-${i + 1}`,
            pickNumber: i + 1,
        }));
        const timeline = computeInflationTimeline(
            completed,
            players,
            { totalBudgetPerTeam: BUDGET, teamCount: TEAM_COUNT },
            ROSTER_NEEDS,
            baseline,
            options
        );

        // Pick 1's model price is the empty-board prediction — exactly what
        // InflationPredictor quotes before any pick.
        const emptyCtx = makeContext(players, [], []);
        const predictor = new InflationPredictor(baseline, options);
        expect(timeline[0].modelPrice).toBe(predictor.predict(drafted[0], emptyCtx).price);

        // Pick 2's model price uses the post-pick-1 state, not the empty board.
        const afterOne = makeContext(players, [drafted[0]], [50], {
            teams: [],
        });
        expect(timeline[1].modelPrice).toBe(predictor.predict(drafted[1], afterOne).price);
        expect(timeline.every(p => p.modelPrice >= 1)).toBe(true);
    });
});

describe('priceWithInflationField', () => {
    const { players, picks } = buildPool(220);
    const baseline: BaselineModels = createBaselineModels(picks);

    it('matches InflationPredictor.predict across the pool and blend values', () => {
        const drafted = players.slice(0, 30);
        const ctx = makeContext(
            players,
            drafted,
            drafted.map((_, i) => Math.max(1, 60 - i))
        );
        for (const blend of [1, 0.6, 0]) {
            const options = { elasticity: 0.5, blend };
            const predictor = new InflationPredictor(baseline, options);
            const field = computeInflation(ctx, baseline, options);
            for (const player of ctx.availablePlayers.slice(0, 40)) {
                expect(priceWithInflationField(player, field, baseline, options)).toBe(
                    predictor.predict(player, ctx).price
                );
            }
        }
    });
});
