'use client';

import React from 'react';
import Tooltip from '@/ui/Tooltip';
import { PositionBadge } from '@/ui/Badge';
import { CompletedPick, PredictorPlayer } from '@/lib/models/live-draft/predictor';
import { HELP } from '../SimulatorGuide';
import { formatDelta } from './format';

export type NamedPick = CompletedPick & { player: PredictorPlayer & { name?: string } };

interface Props {
    picks: NamedPick[];
    pickDeltas: Map<number, number>;
    /** Display label for a pick's team id (simulator: "Team N"; live: real names). */
    teamLabel: (teamId: string) => string;
    /** Live board wants the latest pick on top. */
    newestFirst?: boolean;
    emptyText: string;
    /** In the board's narrow left column the Δ Infl column doesn't fit until
     *  xl — hide it below that instead of forcing horizontal scroll. */
    hideDeltaBelowXl?: boolean;
}

/** The picks board shared by the simulator and the game-day page. */
const PicksTable: React.FC<Props> = ({ picks, pickDeltas, teamLabel, newestFirst = false, emptyText, hideDeltaBelowXl }) => {
    if (picks.length === 0) {
        return <p className="text-sm text-gray-500">{emptyText}</p>;
    }
    const deltaCellClass = hideDeltaBelowXl ? 'hidden xl:table-cell' : '';
    const rows = newestFirst ? [...picks].reverse() : picks;
    return (
        <div className="overflow-x-auto max-h-80 overflow-y-auto" data-testid="simulated-picks">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                        <th className="py-2 pr-2">#</th>
                        <th className="py-2 pr-2">Player</th>
                        <th className="py-2 pr-2">Pos</th>
                        <th className="py-2 pr-2">Team</th>
                        <th className="py-2 pr-2 text-right">Price</th>
                        <th className={`py-2 pr-2 text-right ${deltaCellClass}`}>
                            <Tooltip text={HELP.pickDelta}>
                                <span>Δ Infl</span>
                            </Tooltip>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(pick => (
                        <tr
                            key={pick.pickNumber}
                            className="border-b border-gray-100 dark:border-gray-800"
                        >
                            <td className="py-1.5 pr-2 text-gray-500">
                                {pick.pickNumber}
                            </td>
                            <td className="py-1.5 pr-2">
                                {pick.player.name ?? pick.player.id}
                            </td>
                            <td className="py-1.5 pr-2">
                                <PositionBadge position={pick.player.defaultPosition} />
                            </td>
                            <td className="py-1.5 pr-2 text-gray-500">
                                {teamLabel(pick.teamId)}
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">
                                ${pick.price}
                            </td>
                            <td
                                className={`py-1.5 pr-2 text-right tabular-nums text-gray-500 ${deltaCellClass}`}
                                data-testid="pick-delta"
                            >
                                {formatDelta(pickDeltas.get(pick.pickNumber))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default PicksTable;
