/**
 * Reconciles the "my roster" draft plan against the live board each poll:
 * my team's real picks lock into slots, penciled-in players keep their slots
 * (or shift when a lock lands on one), and players drafted by other teams are
 * flagged sniped rather than silently dropped.
 *
 * Persisted state is the slot→{playerId, delta} map only — planned prices are
 * always the *current* model estimate plus the user's delta, so estimates
 * track the market without any state writes. The market model deliberately
 * knows nothing about the plan: planned players still receive (and exert)
 * live market pricing. Do not feed the plan back into the inflation context.
 *
 * The reconciliation is idempotent: running it again over its own
 * effectiveSelections is a fixed point (unit-tested), which lets the hook
 * commit lock-driven changes with a plain normalize-on-change effect.
 */

import { RosterSlot } from '@/types/storage';
import { LiveBoardPick } from './liveBoard';
import { PredictorPlayer } from './predictor';

/** Structurally matches SimulatorPlayer from useSimulatorData. */
export type PlannerPlayer = PredictorPlayer & { name?: string; positions?: string[] };

export interface PlannedSlotSelection {
    playerId: string;
    /** User's price nudge relative to the live model estimate. */
    delta: number;
}

/** Keyed by serializePlanSlot(slot). */
export type PlanSelections = Record<string, PlannedSlotSelection>;

export function serializePlanSlot(slot: RosterSlot): string {
    return `${slot.position}#${slot.index}`;
}

export interface RosterPlanRowLocked {
    kind: 'locked';
    slot: RosterSlot;
    pick: LiveBoardPick;
    /** No open eligible slot existed; rendered appended after the slot list. */
    overflow: boolean;
}

export interface RosterPlanRowPlanned {
    kind: 'planned';
    slot: RosterSlot;
    playerId: string;
    /** null = no longer in the ranked pool (entry retained, excluded from spend) */
    player: PlannerPlayer | null;
    delta: number;
    estimate: number | null;
    /** max(1, estimate + delta); null when the player/estimate is missing */
    price: number | null;
    /** Set when another team drafted this player (excluded from spend). */
    snipedBy: { teamId: string; price: number } | null;
}

export interface RosterPlanRowEmpty {
    kind: 'empty';
    slot: RosterSlot;
}

export type RosterPlanRow = RosterPlanRowLocked | RosterPlanRowPlanned | RosterPlanRowEmpty;

export interface RosterPlanBudget {
    budget: number;
    /** Σ my picks' real prices (overflow included) */
    lockedSpend: number;
    /** Σ planned price over rows that are neither sniped nor pool-missing */
    plannedSpend: number;
    /** $1 per row that must still be filled with something unplanned */
    reserve: number;
    totalCommitted: number;
    /** Real dollars in hand: budget − lockedSpend */
    remaining: number;
    openSlots: number;
    /** Classic auction max bid: remaining − $1 × (open slots − 1) */
    maxBid: number;
    overBudget: boolean;
}

export interface RosterPlanInput {
    /** Lineup order (computeRosterSlots output). */
    slots: RosterSlot[];
    /** Full board picks, pickNumber ascending. */
    picks: LiveBoardPick[];
    myTeamId: string | null;
    selections: PlanSelections;
    /** Ranked pool by player id. */
    pool: ReadonlyMap<string, PlannerPlayer>;
    estimate: (player: PlannerPlayer) => number;
    budget: number;
}

export interface RosterPlanResult {
    /** Slot order, overflow locked rows appended. */
    rows: RosterPlanRow[];
    budget: RosterPlanBudget;
    /** Selections after consume/shift/drop — commit these back to state. */
    effectiveSelections: PlanSelections;
    /** Entries dropped this pass (no open eligible slot / displaced pool-miss). */
    displaced: { playerId: string; name?: string }[];
}

function eligible(
    player: { positions?: string[]; defaultPosition: string },
    position: string
): boolean {
    if (player.positions && player.positions.length > 0) {
        return player.positions.includes(position);
    }
    // Pool-miss fallback (deep bench / K / D/ST locked picks): exact position
    // or the always-eligible bench.
    return player.defaultPosition === position || position === 'Bench';
}

/**
 * Where a click-to-plan assignment would land: the first empty slot matching
 * the player's default position, else the first empty slot the player is
 * eligible for (flex, then bench, per lineup order). Null when nothing fits.
 */
export function firstOpenSlotFor(rows: RosterPlanRow[], player: PlannerPlayer): RosterSlot | null {
    const empty = rows.filter((row): row is RosterPlanRowEmpty => row.kind === 'empty');
    const exact = empty.find(row => row.slot.position === player.defaultPosition);
    if (exact) return exact.slot;
    const fallback = empty.find(row => eligible(player, row.slot.position));
    return fallback?.slot ?? null;
}

export function reconcileRosterPlan(input: RosterPlanInput): RosterPlanResult {
    const { slots, picks, myTeamId, selections, pool, estimate, budget } = input;
    const slotKeys = slots.map(serializePlanSlot);
    const validKeys = new Set(slotKeys);

    // 1. Partition picks. With no team selected, every pick snipes.
    const myPicks = myTeamId === null ? [] : picks.filter(p => p.teamId === myTeamId);
    const myPlayerIds = new Set(myPicks.map(p => p.player.id));
    const otherPickByPlayer = new Map<string, LiveBoardPick>();
    for (const pick of picks) {
        if (!myPlayerIds.has(pick.player.id)) otherPickByPlayer.set(pick.player.id, pick);
    }

    // 2. Collect entries in lineup order: consume ones I actually drafted,
    //    keep the first of any duplicated player. Unknown keys (roster
    //    settings changed) sort after known ones and must re-place.
    interface Entry {
        key: string;
        known: boolean;
        selection: PlannedSlotSelection;
    }
    const displaced: { playerId: string; name?: string }[] = [];
    const seenPlayers = new Set<string>();
    const entries: Entry[] = [];
    const entryKeys = [
        ...slotKeys.filter(key => selections[key]),
        ...Object.keys(selections).filter(key => !validKeys.has(key)).sort(),
    ];
    for (const key of entryKeys) {
        const selection = selections[key];
        if (myPlayerIds.has(selection.playerId)) continue; // consumed by a real pick
        if (seenPlayers.has(selection.playerId)) {
            displaced.push({
                playerId: selection.playerId,
                name: pool.get(selection.playerId)?.name,
            });
            continue;
        }
        seenPlayers.add(selection.playerId);
        entries.push({ key, known: validKeys.has(key), selection });
    }

    // 3. Locked picks claim slots first, in pick order: exact defaultPosition
    //    slot, else first eligible slot in lineup order, else overflow.
    const occupied = new Set<string>();
    const lockedBySlot = new Map<string, RosterPlanRowLocked>();
    const overflow: RosterPlanRowLocked[] = [];
    for (const pick of myPicks) {
        const forEligibility = pool.get(pick.player.id) ?? pick.player;
        const exact = slots.find(
            s => !occupied.has(serializePlanSlot(s)) && s.position === pick.player.defaultPosition
        );
        const target =
            exact ??
            slots.find(
                s => !occupied.has(serializePlanSlot(s)) && eligible(forEligibility, s.position)
            );
        if (target) {
            const key = serializePlanSlot(target);
            occupied.add(key);
            lockedBySlot.set(key, { kind: 'locked', slot: target, pick, overflow: false });
        } else {
            overflow.push({
                kind: 'locked',
                slot: { position: pick.player.defaultPosition, index: -1 },
                pick,
                overflow: true,
            });
        }
    }

    // 4. Place plan entries: stability pass (own slot still open wins), then
    //    shift displaced entries to the first open eligible slot.
    const placedBySlot = new Map<string, Entry>();
    const toShift: Entry[] = [];
    for (const entry of entries) {
        if (entry.known && !occupied.has(entry.key)) {
            occupied.add(entry.key);
            placedBySlot.set(entry.key, entry);
        } else {
            toShift.push(entry);
        }
    }
    for (const entry of toShift) {
        const player = pool.get(entry.selection.playerId);
        // A displaced entry whose player left the pool has no eligibility
        // information — drop it rather than guess.
        const target = player
            ? slots.find(
                  s => !occupied.has(serializePlanSlot(s)) && eligible(player, s.position)
              )
            : undefined;
        if (target) {
            const key = serializePlanSlot(target);
            occupied.add(key);
            placedBySlot.set(key, entry);
        } else {
            displaced.push({ playerId: entry.selection.playerId, name: player?.name });
        }
    }

    // 5. Rows in slot order, overflow appended.
    const rows: RosterPlanRow[] = [];
    const effectiveSelections: PlanSelections = {};
    for (const slot of slots) {
        const key = serializePlanSlot(slot);
        const locked = lockedBySlot.get(key);
        if (locked) {
            rows.push(locked);
            continue;
        }
        const entry = placedBySlot.get(key);
        if (!entry) {
            rows.push({ kind: 'empty', slot });
            continue;
        }
        const player = pool.get(entry.selection.playerId) ?? null;
        const est = player ? estimate(player) : null;
        const snipe = otherPickByPlayer.get(entry.selection.playerId);
        rows.push({
            kind: 'planned',
            slot,
            playerId: entry.selection.playerId,
            player,
            delta: entry.selection.delta,
            estimate: est,
            price: est === null ? null : Math.max(1, est + entry.selection.delta),
            snipedBy: snipe ? { teamId: snipe.teamId, price: snipe.price } : null,
        });
        effectiveSelections[key] = entry.selection;
    }
    rows.push(...overflow);

    // 6. Budget.
    const lockedSpend = myPicks.reduce((sum, pick) => sum + pick.price, 0);
    let plannedSpend = 0;
    let reserve = 0;
    for (const row of rows) {
        if (row.kind === 'empty') {
            reserve += 1;
        } else if (row.kind === 'planned') {
            if (row.snipedBy !== null || row.price === null) {
                reserve += 1; // the slot still has to be filled with something
            } else {
                plannedSpend += row.price;
            }
        }
    }
    const remaining = budget - lockedSpend;
    const openSlots = slots.length - lockedBySlot.size;
    const totalCommitted = lockedSpend + plannedSpend + reserve;

    return {
        rows,
        budget: {
            budget,
            lockedSpend,
            plannedSpend,
            reserve,
            totalCommitted,
            remaining,
            openSlots,
            maxBid: openSlots === 0 ? 0 : Math.max(0, remaining - (openSlots - 1)),
            overBudget: totalCommitted > budget,
        },
        effectiveSelections,
        displaced,
    };
}
