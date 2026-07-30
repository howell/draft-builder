'use client';

/**
 * The "my roster" draft planner: my team's real picks locked at their real
 * prices, open slots penciled in with remaining players at the live model's
 * estimate ± the user's nudge, and budget totals that update as the draft
 * progresses. Team identity comes from the draft room's TOKEN frame, with a
 * manual override remembered per league.
 */

import React, { useMemo } from 'react';
import { LeagueTeam } from '@/platforms/PlatformApi';
import type { CostEstimatedPlayer, RosterSlot } from '@/types/storage';
import { Card, CardBody } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import CollapsibleComponent from '@/ui/Collapsible';
import { LiveBoard } from '@/lib/models/live-draft/liveBoard';
import { PlannerPlayer } from '@/lib/models/live-draft/rosterPlan';
import MockRosterEntry from '../../../mocks/MockRosterEntry';
import { UseRosterPlanResult } from '../../hooks/useRosterPlan';
import { LockedRosterRow, SnipedRosterRow } from './RosterPlannerRows';
import type { SimulatorPlayer } from '../../useSimulatorData';

interface Props {
    board: LiveBoard;
    players: SimulatorPlayer[];
    estimate: ((player: PlannerPlayer) => number) | null;
    teams: LeagueTeam[];
    teamLabel: (teamId: string) => string;
    /** Owned by LiveDraftBoard so the explorer's click-to-plan shares it. */
    plan: UseRosterPlanResult;
}

const noopFocus = () => {};

const MyRosterPlanner: React.FC<Props> = ({
    board,
    players,
    estimate,
    teams,
    teamLabel,
    plan,
}) => {
    const draftedIds = useMemo(
        () => new Set(board.picks.map(pick => pick.player.id)),
        [board.picks]
    );
    const plannedIds = useMemo(
        () =>
            new Set(
                plan.rows.flatMap(row => (row.kind === 'planned' ? [row.playerId] : []))
            ),
        [plan.rows]
    );

    // Candidates for the slot autocompletes: undrafted, unplanned pool
    // players with names and eligibility, priced at the live estimate.
    const candidates = useMemo<CostEstimatedPlayer[]>(() => {
        return players
            .filter(
                p =>
                    p.name !== undefined &&
                    p.positions !== undefined &&
                    p.positions.length > 0 &&
                    !draftedIds.has(p.id) &&
                    !plannedIds.has(p.id)
            )
            .sort((a, b) => a.overallRank - b.overallRank)
            .map(p => ({
                id: p.id,
                name: p.name!,
                defaultPosition: p.defaultPosition,
                positions: p.positions!,
                overallRank: p.overallRank,
                positionRank: p.positionRank,
                estimatedCost: estimate ? estimate(p) : 1,
            }));
    }, [players, draftedIds, plannedIds, estimate]);

    const selectValue = plan.teamOverride ?? '';
    const onTeamChange = (value: string) => plan.setTeamOverride(value === '' ? null : value);

    const selectedFor = (row: { player: PlannerPlayer | null; estimate: number | null }) => {
        if (!row.player || row.estimate === null) return undefined;
        return {
            id: row.player.id,
            name: row.player.name ?? row.player.id,
            defaultPosition: row.player.defaultPosition,
            positions: row.player.positions ?? [row.player.defaultPosition],
            overallRank: row.player.overallRank,
            positionRank: row.player.positionRank,
            estimatedCost: row.estimate,
        };
    };

    const clearSlot = (slot: RosterSlot) => plan.selectPlayer(slot, undefined);

    const budgetStrip = plan.budget && (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600 dark:text-gray-300">
            <span data-testid="plan-total">Total ${plan.budget.budget}</span>
            <span data-testid="plan-locked">Locked ${plan.budget.lockedSpend}</span>
            <span data-testid="plan-planned">Planned ${plan.budget.plannedSpend}</span>
            <span
                data-testid="plan-remaining"
                className={plan.budget.overBudget ? 'text-red-600 dark:text-red-400 font-semibold' : ''}
            >
                Remaining ${plan.budget.budget - plan.budget.totalCommitted}
            </span>
            <span data-testid="plan-max-bid">Max bid ${plan.budget.maxBid}</span>
            {plan.budget.overBudget && <Badge variant="error">over budget</Badge>}
        </span>
    );

    return (
        <Card data-testid="my-roster-planner">
            <CardBody>
                <CollapsibleComponent
                    defaultOpen
                    testId="my-roster-toggle"
                    label={
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 grow">
                            <h3 className="text-lg font-semibold">My roster</h3>
                            <select
                                data-testid="my-roster-team-select"
                                className="h-8 px-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm"
                                value={selectValue}
                                onChange={e => onTeamChange(e.target.value)}
                            >
                                <option value="">
                                    {plan.detectedTeamId
                                        ? `Auto — ${teamLabel(plan.detectedTeamId)}`
                                        : 'Select your team…'}
                                </option>
                                {teams.map(team => (
                                    <option key={team.id} value={team.id}>
                                        {team.name}
                                    </option>
                                ))}
                            </select>
                            {budgetStrip}
                        </div>
                    }
                >
                    {plan.displacedNames.length > 0 && (
                        <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                            Dropped from the plan (no open slot): {plan.displacedNames.join(', ')}{' '}
                            <button className="underline" onClick={plan.dismissDisplaced}>
                                dismiss
                            </button>
                        </p>
                    )}
                    {plan.myTeamId === null ? (
                        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                            Waiting for the draft room to identify your team — or pick it from the
                            dropdown to start planning.
                        </p>
                    ) : (
                        <div className="mt-2 overflow-x-auto">
                            <table className="w-full text-sm" data-testid="my-roster-table">
                                <tbody>
                                    {plan.rows.map(row => {
                                        const rowKey = `${row.slot.position}#${row.slot.index}#${row.kind}`;
                                        if (row.kind === 'locked') {
                                            return <LockedRosterRow key={rowKey} row={row} />;
                                        }
                                        if (
                                            row.kind === 'planned' &&
                                            (row.snipedBy !== null || row.player === null)
                                        ) {
                                            return (
                                                <SnipedRosterRow
                                                    key={rowKey}
                                                    row={row}
                                                    teamLabel={teamLabel}
                                                    onClear={() => clearSlot(row.slot)}
                                                />
                                            );
                                        }
                                        return (
                                            <MockRosterEntry
                                                key={rowKey}
                                                rosterSlot={row.slot}
                                                position={row.slot.position}
                                                players={candidates}
                                                selectedPlayer={
                                                    row.kind === 'planned' ? selectedFor(row) : undefined
                                                }
                                                costAdjustment={row.kind === 'planned' ? row.delta : 0}
                                                onPlayerSelected={(slot, player) =>
                                                    plan.selectPlayer(slot, player)
                                                }
                                                onCostAdjusted={(slot, delta) =>
                                                    plan.adjustCost(slot, delta > 0 ? 1 : -1)
                                                }
                                                onFocus={noopFocus}
                                            />
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CollapsibleComponent>
            </CardBody>
        </Card>
    );
};

export default MyRosterPlanner;
