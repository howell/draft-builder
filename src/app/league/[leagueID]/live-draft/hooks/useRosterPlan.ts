'use client';

/**
 * State glue for the "my roster" planner: hydrates the persisted plan,
 * reconciles it against the live board every poll, commits lock-driven
 * changes back to state (reconciliation is idempotent, so this converges in
 * one pass), and persists edits debounced. Only user actions and lock-driven
 * normalization write state — estimate changes from polling never do.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LeagueId } from '@/platforms/common';
import type { RosterSettings } from '@/platforms/PlatformApi';
import type { CostEstimatedPlayer, RosterSlot } from '@/types/storage';
import { LiveBoard } from '@/lib/models/live-draft/liveBoard';
import {
    PlannerPlayer,
    PlanSelections,
    reconcileRosterPlan,
    RosterPlanBudget,
    RosterPlanRow,
    serializePlanSlot,
} from '@/lib/models/live-draft/rosterPlan';
import {
    LeagueRosterPlan,
    useLeagueRosterPlansQuery,
    useSaveLeagueRosterPlanMutation,
} from '@/hooks/queries/useLeagueRosterPlans';
import { computeRosterSlots } from '../../mocks/MockTable';
import type { SimulatorPlayer } from '../useSimulatorData';

const PERSIST_DEBOUNCE_MS = 500;

export interface UseRosterPlanArgs {
    leagueId: LeagueId;
    board: LiveBoard | null;
    players: SimulatorPlayer[];
    rosterNeeds: RosterSettings;
    budget: number;
    estimate: ((player: PlannerPlayer) => number) | null;
}

export interface UseRosterPlanResult {
    /** Stored plan hydrated and board data present. */
    ready: boolean;
    detectedTeamId: string | null;
    /** The manual override itself, when one is set. */
    teamOverride: string | null;
    /** Manual override ?? TOKEN-detected team. */
    myTeamId: string | null;
    setTeamOverride: (teamId: string | null) => void;
    rows: RosterPlanRow[];
    budget: RosterPlanBudget | null;
    /** Names of plan entries dropped by lock displacement, until dismissed. */
    displacedNames: string[];
    dismissDisplaced: () => void;
    selectPlayer: (slot: RosterSlot, player?: CostEstimatedPlayer) => void;
    adjustCost: (slot: RosterSlot, step: 1 | -1) => void;
}

export function useRosterPlan({
    leagueId,
    board,
    players,
    rosterNeeds,
    budget,
    estimate,
}: UseRosterPlanArgs): UseRosterPlanResult {
    const plansQuery = useLeagueRosterPlansQuery();
    const saveMutation = useSaveLeagueRosterPlanMutation();

    const [selections, setSelections] = useState<PlanSelections>({});
    const [teamOverride, setTeamOverrideState] = useState<string | undefined>(undefined);
    const [displacedNames, setDisplacedNames] = useState<string[]>([]);
    const [hydrated, setHydrated] = useState(false);
    const lastPersistedRef = useRef<string | null>(null);

    // Hydrate once from the stored plan — state adjusted during render (the
    // guarded setState-in-render pattern, see MockRosterEntry) so the first
    // hydrated render already has the stored plan. The persist effect records
    // the hydrated snapshot as its baseline on its first run.
    const stored = plansQuery.data?.[leagueId];
    if (!hydrated && plansQuery.data !== undefined) {
        setSelections(stored?.selections ?? {});
        setTeamOverrideState(stored?.teamId);
        setHydrated(true);
    }

    const slots = useMemo(() => computeRosterSlots(rosterNeeds), [rosterNeeds]);
    const pool = useMemo(
        () => new Map<string, PlannerPlayer>(players.map(p => [p.id, p])),
        [players]
    );

    const detectedTeamId = board?.myTeamId ?? null;
    const myTeamId = teamOverride ?? detectedTeamId;

    // Reconciling against a half-loaded world (no board, empty slot list)
    // would displace-drop the whole plan — gate everything on real data.
    const active = hydrated && board !== null && slots.length > 0;

    const estimateFn = useMemo(() => estimate ?? (() => 1), [estimate]);

    const result = useMemo(() => {
        if (!active) return null;
        return reconcileRosterPlan({
            slots,
            picks: board!.picks,
            myTeamId,
            selections,
            pool,
            estimate: estimateFn,
            budget,
        });
    }, [active, slots, board, myTeamId, selections, pool, estimateFn, budget]);

    // Normalize-on-change: locks consumed/shifted/dropped entries — commit
    // during render (guarded; reconciliation is idempotent, so this settles
    // after a single re-render).
    if (result && JSON.stringify(result.effectiveSelections) !== JSON.stringify(selections)) {
        setSelections(result.effectiveSelections);
        if (result.displaced.length > 0) {
            const displaced = result.displaced;
            setDisplacedNames(prev => [
                ...prev,
                ...displaced
                    .map(d => d.name ?? `player ${d.playerId}`)
                    .filter(name => !prev.includes(name)),
            ]);
        }
    }

    // Debounced persist of user/normalization changes. The first run after
    // hydration records the stored snapshot as the diff baseline.
    useEffect(() => {
        if (!hydrated) return;
        const snapshot = JSON.stringify({ teamId: teamOverride, selections });
        if (lastPersistedRef.current === null) {
            lastPersistedRef.current = snapshot;
            return;
        }
        if (snapshot === lastPersistedRef.current) return;
        const timer = setTimeout(() => {
            lastPersistedRef.current = snapshot;
            const empty = teamOverride === undefined && Object.keys(selections).length === 0;
            const plan: LeagueRosterPlan | null = empty ? null : { teamId: teamOverride, selections };
            saveMutation.mutate({ leagueId, plan });
        }, PERSIST_DEBOUNCE_MS);
        return () => clearTimeout(timer);
        // saveMutation is stable per render; excluding it avoids effect churn.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hydrated, teamOverride, selections, leagueId]);

    const setTeamOverride = useCallback((teamId: string | null) => {
        setTeamOverrideState(teamId ?? undefined);
    }, []);

    const selectPlayer = useCallback((slot: RosterSlot, player?: CostEstimatedPlayer) => {
        const slotKey = serializePlanSlot(slot);
        setSelections(prev => {
            const next = { ...prev };
            if (player) {
                next[slotKey] = { playerId: player.id, delta: 0 };
            } else {
                delete next[slotKey];
            }
            return next;
        });
    }, []);

    const adjustCost = useCallback(
        (slot: RosterSlot, step: 1 | -1) => {
            const slotKey = serializePlanSlot(slot);
            setSelections(prev => {
                const entry = prev[slotKey];
                if (!entry) return prev;
                let delta = entry.delta + step;
                const player = pool.get(entry.playerId);
                if (player) {
                    // Keep the displayed price (estimate + delta) at the $1 floor.
                    delta = Math.max(delta, 1 - estimateFn(player));
                }
                return { ...prev, [slotKey]: { ...entry, delta } };
            });
        },
        [pool, estimateFn]
    );

    const dismissDisplaced = useCallback(() => setDisplacedNames([]), []);

    return {
        ready: active,
        detectedTeamId,
        teamOverride: teamOverride ?? null,
        myTeamId,
        setTeamOverride,
        rows: result?.rows ?? [],
        budget: result?.budget ?? null,
        displacedNames,
        dismissDisplaced,
        selectPlayer,
        adjustCost,
    };
}
