/**
 * League draft history: normalization and league-tendency signals.
 *
 * Everything here turns past drafts into inputs for the inflation model:
 *
 *  - `normalizeHistoricalDraft` reshapes a platform draft into the backtest's
 *    `HistoricalDraft`. Ranks are derived from the draft's own price ordering
 *    rather than current consensus rankings — current rankings don't exist for
 *    past seasons (rookies, retirements), and price-rank is uniform across
 *    every season. The trade-off: the "rank" given to the model encodes the
 *    realized price *ordering* (not prices), so absolute baseline accuracy in
 *    the backtest is flattered; the backtest's real job is comparing how
 *    models handle mid-draft *dynamics*, which this preserves.
 *
 *  - `createPooledBaselineModels` fits the exponential curves on every season
 *    at once. Points are (within-draft price rank, price) so seasons overlay
 *    on the same x-axis — concatenating picks and re-indexing would stretch
 *    the curve by the number of seasons.
 *
 *  - `computePositionalPriors` / `averageUnspent` measure this league's habits
 *    (positional premium, money left on the table) for the model's
 *    league-history knobs.
 */

import {
    createBaselineModels,
    findBestRegression,
    BaselineModels,
} from '@/app/league/analytics';
import { CompletedPick, PredictorPlayer, baselineValue } from './predictor';
// type-only: backtest.ts imports values from this module, so a value import
// here would create a real circular dependency
import type { HistoricalDraft } from './backtest';

/** The raw shape of a historical pick as the platforms report it. */
export interface RawHistoricalPick {
    playerId: string;
    position: string;
    price: number;
    team: string | number;
    overallPickNumber: number;
}

export interface RawHistoricalDraft {
    season?: string;
    picks: RawHistoricalPick[];
    auctionBudget: number;
    rosterNeeds: Record<string, number>;
}

/** A player's stored platform valuation for a season (1-indexed ranks as published). */
export interface PlatformValueLookupEntry {
    overallRank: number | null;
    positionRank: number | null;
    auctionValue: number | null;
}

/**
 * Normalize a platform draft for the backtest. With a `platformValues` lookup
 * (player id → stored preseason values from platform_player_values), players
 * get their REAL preseason ranks and platform prices — the same inputs a live
 * draft room shows. Players missing from the lookup (and all players when no
 * lookup is given) fall back to ranks derived from the draft's own price
 * ordering; the fallback flatters absolute baseline accuracy in the backtest
 * but preserves the mid-draft dynamics the model comparison cares about.
 */
export function normalizeHistoricalDraft(
    raw: RawHistoricalDraft,
    platformValues?: Map<string, PlatformValueLookupEntry>
): HistoricalDraft | null {
    if (raw.picks.length === 0) return null;

    const byPrice = [...raw.picks].sort((a, b) => b.price - a.price);
    const positionCounters: Record<string, number> = {};
    const playerById = new Map<string, PredictorPlayer>();
    byPrice.forEach((pick, index) => {
        const priceDerivedPositionRank = positionCounters[pick.position] ?? 0;
        positionCounters[pick.position] = priceDerivedPositionRank + 1;
        const stored = platformValues?.get(pick.playerId);
        playerById.set(pick.playerId, {
            id: pick.playerId,
            defaultPosition: pick.position,
            // Published ranks are 1-indexed; the app's ranks are 0-indexed.
            overallRank: stored?.overallRank != null ? stored.overallRank - 1 : index,
            positionRank:
                stored?.positionRank != null ? stored.positionRank - 1 : priceDerivedPositionRank,
            platformValue: stored?.auctionValue ?? undefined,
        });
    });

    const teams = new Set<string>();
    const picks: CompletedPick[] = [...raw.picks]
        .sort((a, b) => a.overallPickNumber - b.overallPickNumber)
        .map(pick => {
            teams.add(String(pick.team));
            return {
                player: playerById.get(pick.playerId)!,
                price: pick.price,
                teamId: String(pick.team),
                pickNumber: pick.overallPickNumber,
            };
        });

    return {
        season: raw.season,
        picks,
        budgetConfig: {
            totalBudgetPerTeam: raw.auctionBudget,
            teamCount: teams.size > 0 ? teams.size : 12,
        },
        rosterNeeds: raw.rosterNeeds,
        players: Array.from(playerById.values()),
    };
}

const MIN_POSITION_POINTS = 10;

/**
 * Fit the exponential baseline curves on several seasons at once. Positions
 * without enough pooled data alias the overall model (same object identity, so
 * `baselineValue` knows to evaluate them at overallRank instead).
 */
export function createPooledBaselineModels(drafts: HistoricalDraft[]): BaselineModels {
    if (drafts.length === 0) {
        throw new Error('No drafts provided for pooled baseline creation');
    }
    if (drafts.length === 1) {
        return createBaselineModels(
            drafts[0].picks.map(p => ({ price: p.price, position: p.player.defaultPosition }))
        );
    }

    const overallData: [number, number][] = [];
    const positionData: Record<string, [number, number][]> = {};
    for (const draft of drafts) {
        const byPrice = [...draft.picks].sort((a, b) => b.price - a.price);
        const positionCounters: Record<string, number> = {};
        byPrice.forEach((pick, index) => {
            overallData.push([index, pick.price]);
            const pos = pick.player.defaultPosition;
            const posRank = positionCounters[pos] ?? 0;
            positionCounters[pos] = posRank + 1;
            (positionData[pos] ??= []).push([posRank, pick.price]);
        });
    }

    // findBestRegression's top-subset heuristic expects price-descending data.
    overallData.sort((a, b) => b[1] - a[1]);
    const overall = findBestRegression(overallData);

    const positions: Record<string, BaselineModels['overall']> = {};
    for (const [pos, data] of Object.entries(positionData)) {
        if (data.length >= MIN_POSITION_POINTS) {
            data.sort((a, b) => b[1] - a[1]);
            try {
                positions[pos] = findBestRegression(data);
            } catch {
                positions[pos] = overall;
            }
        } else {
            positions[pos] = overall;
        }
    }

    return { overall, positions };
}

/**
 * This league's historical per-position spend premium: the ratio of the share
 * of money the league actually spent on a position to the share the baseline
 * expected for the same players. 1.0 = neutral; 1.2 = the league historically
 * pays 20% over the baseline's share (e.g. a TE-premium room).
 */
export function computePositionalPriors(
    drafts: HistoricalDraft[],
    baseline: BaselineModels,
    positionalValues = false
): Record<string, number> {
    const spentByPosition: Record<string, number> = {};
    const expectedByPosition: Record<string, number> = {};
    let spentTotal = 0;
    let expectedTotal = 0;

    for (const draft of drafts) {
        for (const pick of draft.picks) {
            const pos = pick.player.defaultPosition;
            spentByPosition[pos] = (spentByPosition[pos] ?? 0) + pick.price;
            spentTotal += pick.price;
            const expected = baselineValue(pick.player, baseline, positionalValues);
            expectedByPosition[pos] = (expectedByPosition[pos] ?? 0) + expected;
            expectedTotal += expected;
        }
    }

    const priors: Record<string, number> = {};
    if (spentTotal <= 0 || expectedTotal <= 0) return priors;
    for (const pos of Object.keys(spentByPosition)) {
        const spentShare = spentByPosition[pos] / spentTotal;
        const expectedShare = (expectedByPosition[pos] ?? 0) / expectedTotal;
        if (expectedShare > 0) {
            priors[pos] = spentShare / expectedShare;
        }
    }
    return priors;
}

/**
 * Average money the league leaves unspent at the end of a draft. That money
 * was never going to chase players, so mid-draft inflation shouldn't count it.
 */
export function averageUnspent(drafts: HistoricalDraft[]): number {
    if (drafts.length === 0) return 0;
    let totalUnspent = 0;
    for (const draft of drafts) {
        const totalBudget = draft.budgetConfig.totalBudgetPerTeam * draft.budgetConfig.teamCount;
        const spent = draft.picks.reduce((sum, p) => sum + p.price, 0);
        totalUnspent += Math.max(0, totalBudget - spent);
    }
    return totalUnspent / drafts.length;
}
