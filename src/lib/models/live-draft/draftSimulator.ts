/**
 * Generative auction-draft simulator.
 *
 * Drives a mock draft forward by having teams nominate and "win" players at a
 * chosen predictor's price plus noise, while respecting budgets, roster slots,
 * and the $1-per-open-slot reserve. Two uses:
 *
 *  1. Produce a random-but-plausible mid-draft state (`stopAtPick = K`) for the
 *     simulator UI to explore.
 *  2. Sanity-check a pricing model: a full simulated draft should leave every
 *     roster filled, every budget respected, and roughly the whole budget spent.
 *
 * The simulator is intentionally decoupled from storage types — it emits plain
 * `CompletedPick`/`PredictorTeam` data that the UI maps onto `LiveDraftState`.
 */

import {
    PricePredictor,
    PredictorPlayer,
    PredictorTeam,
    CompletedPick,
    PredictionContext,
} from './predictor';

export interface SimulationConfig {
    predictor: PricePredictor;
    /** full ranked player pool (undrafted at the start) */
    players: PredictorPlayer[];
    budgetConfig: { totalBudgetPerTeam: number; teamCount: number };
    /** required count of each roster position, per team */
    rosterNeeds: Record<string, number>;
    /** stop after this many picks; defaults to a full draft */
    stopAtPick?: number;
    /** RNG seed for reproducibility */
    seed?: number;
    /** multiplicative price noise (fractional std-dev); default 0.15 */
    noise?: number;
}

export interface SimulationInvariants {
    /** every team reached its full roster size */
    allRostersFilled: boolean;
    /** no team spent more than its budget */
    budgetsRespected: boolean;
    /** every price >= $1 and every team kept >= $1 per remaining slot */
    minimumsRespected: boolean;
    totalSpent: number;
    totalBudget: number;
}

export interface SimulatedDraft {
    picks: CompletedPick[];
    teams: PredictorTeam[];
    invariants: SimulationInvariants;
}

/** Deterministic PRNG (mulberry32) so a seed reproduces a draft exactly. */
function makeRng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Box-Muller standard normal from a uniform RNG. */
function gaussian(rng: () => number): number {
    const u = Math.max(1e-9, rng());
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface SimTeam extends PredictorTeam {
    picksCount: number;
}

export function simulateDraft(config: SimulationConfig): SimulatedDraft {
    const { predictor, budgetConfig, rosterNeeds, seed = 1, noise = 0.15 } = config;
    const rng = makeRng(seed);

    const rosterSize = Object.values(rosterNeeds).reduce((a, b) => a + b, 0);
    const totalSlots = rosterSize * budgetConfig.teamCount;
    const stopAtPick = Math.min(config.stopAtPick ?? totalSlots, totalSlots);

    const teams: SimTeam[] = Array.from({ length: budgetConfig.teamCount }, (_, i) => ({
        id: `team-${i + 1}`,
        remainingBudget: budgetConfig.totalBudgetPerTeam,
        rosterNeeds: { ...rosterNeeds },
        filledPositions: {},
        picksCount: 0,
    }));

    const available = new Map(config.players.map(p => [p.id, p]));
    const picks: CompletedPick[] = [];

    const openSlots = (t: SimTeam) => rosterSize - t.picksCount;
    /** Most a team can bid now while keeping $1 for each of its other open slots. */
    const maxBid = (t: SimTeam) => t.remainingBudget - (openSlots(t) - 1);

    const leagueTargetByPosition = (pos: string) => (rosterNeeds[pos] ?? 0) * budgetConfig.teamCount;
    const leagueFilledByPosition = (pos: string) =>
        teams.reduce((sum, t) => sum + (t.filledPositions[pos] ?? 0), 0);

    const buildContext = (): PredictionContext => ({
        budgetConfig,
        rosterSize,
        picks,
        teams: teams.map(({ picksCount: _picksCount, ...t }) => t),
        availablePlayers: Array.from(available.values()),
        currentPickNumber: picks.length + 1,
    });

    /** Highest-value undrafted player, preferring positions the league still needs. */
    const nominate = (): PredictorPlayer | null => {
        const candidates = Array.from(available.values()).sort(
            (a, b) => a.overallRank - b.overallRank
        );
        if (candidates.length === 0) return null;
        const needed = candidates.find(
            p => leagueFilledByPosition(p.defaultPosition) < leagueTargetByPosition(p.defaultPosition)
        );
        return needed ?? candidates[0];
    };

    while (picks.length < stopAtPick && teams.some(t => openSlots(t) > 0)) {
        const player = nominate();
        if (!player) break;

        const basePrice = predictor.predict(player, buildContext()).price;
        let price = Math.max(1, Math.round(basePrice * (1 + noise * gaussian(rng))));

        // Teams that have an open slot and can afford the price.
        const positionDeficit = (t: SimTeam) =>
            Math.max(0, (rosterNeeds[player.defaultPosition] ?? 0) - (t.filledPositions[player.defaultPosition] ?? 0));

        let eligible = teams.filter(t => openSlots(t) > 0 && maxBid(t) >= price);
        if (eligible.length === 0) {
            // Nobody can pay the noisy price — drop to $1.
            price = 1;
            eligible = teams.filter(t => openSlots(t) > 0 && maxBid(t) >= 1);
        }
        if (eligible.length === 0) {
            // No team can take this player at all; remove from the pool.
            available.delete(player.id);
            continue;
        }

        // Weight by remaining budget and positional need (teams still bid on
        // already-filled positions, just with less weight — the appetite conjecture).
        const weights = eligible.map(t => t.remainingBudget * (1 + positionDeficit(t)));
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let roll = rng() * totalWeight;
        let winner = eligible[eligible.length - 1];
        for (let i = 0; i < eligible.length; i++) {
            roll -= weights[i];
            if (roll <= 0) {
                winner = eligible[i];
                break;
            }
        }

        price = Math.max(1, Math.min(price, maxBid(winner)));

        winner.remainingBudget -= price;
        winner.filledPositions[player.defaultPosition] =
            (winner.filledPositions[player.defaultPosition] ?? 0) + 1;
        winner.picksCount += 1;
        picks.push({
            player,
            price,
            teamId: winner.id,
            pickNumber: picks.length + 1,
        });
        available.delete(player.id);
    }

    return {
        picks,
        teams: teams.map(({ picksCount: _picksCount, ...t }) => t),
        invariants: computeInvariants(teams, rosterSize, budgetConfig, picks.length === stopAtPick && stopAtPick === totalSlots),
    };
}

function computeInvariants(
    teams: SimTeam[],
    rosterSize: number,
    budgetConfig: { totalBudgetPerTeam: number; teamCount: number },
    expectFull: boolean
): SimulationInvariants {
    const totalBudget = budgetConfig.totalBudgetPerTeam * budgetConfig.teamCount;
    const spent = teams.reduce(
        (sum, t) => sum + (budgetConfig.totalBudgetPerTeam - t.remainingBudget),
        0
    );
    return {
        allRostersFilled: !expectFull || teams.every(t => t.picksCount === rosterSize),
        budgetsRespected: teams.every(t => t.remainingBudget >= 0),
        minimumsRespected: teams.every(t => t.remainingBudget >= rosterSize - t.picksCount),
        totalSpent: spent,
        totalBudget,
    };
}
