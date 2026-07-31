'use client';

import React from 'react';
import Tooltip from '@/ui/Tooltip';
import { PositionBadge } from '@/ui/Badge';
import { CompletedPick, PredictorPlayer } from '@/lib/models/live-draft/predictor';
import { HELP } from '../SimulatorGuide';
import { formatDelta, formatDeltaTerse } from './format';

export type NamedPick = CompletedPick & { player: PredictorPlayer & { name?: string } };

interface Props {
    picks: NamedPick[];
    pickDeltas: Map<number, number>;
    /** Display label for a pick's team id (simulator: "Team N"; live: real names). */
    teamLabel: (teamId: string) => string;
    /** Live board wants the latest pick on top. */
    newestFirst?: boolean;
    emptyText: string;
    /** Board's narrow-column mode: tier the columns by viewport instead of
     *  forcing horizontal scroll — ±/Δ Infl always (Δ in terse form, full
     *  precision on hover), #/Model from xl. Simulator/mocks (no prop)
     *  always show everything, verbose. */
    compact?: boolean;
    /** The model's price for each pick as of when they were on the block
     *  (pickNumber → price). Adds a model column and a paid−model ± column. */
    modelPrices?: Map<number, number>;
}

const paidDeltaClass = (delta: number) =>
    delta > 0
        ? 'text-red-600 dark:text-red-400'
        : delta < 0
          ? 'text-green-600 dark:text-green-400'
          : 'text-gray-500';

/** The picks board shared by the simulator and the game-day page. */
const PicksTable: React.FC<Props> = ({ picks, pickDeltas, teamLabel, newestFirst = false, emptyText, compact, modelPrices }) => {
    if (picks.length === 0) {
        return <p className="text-sm text-gray-500">{emptyText}</p>;
    }
    const xlCellClass = compact ? 'hidden xl:table-cell' : '';
    const rows = newestFirst ? [...picks].reverse() : picks;
    return (
        <div className="overflow-x-auto max-h-80 overflow-y-auto" data-testid="simulated-picks">
            <table className="w-full text-sm">
                <thead>
                    <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                        <th className={`py-2 pr-2 ${xlCellClass}`}>#</th>
                        <th className="py-2 pr-2">Player</th>
                        {!compact && <th className="py-2 pr-2">Pos</th>}
                        <th className="py-2 pr-2">Team</th>
                        <th className="py-2 pr-2 text-right">Price</th>
                        {modelPrices && (
                            <>
                                <th className={`py-2 pr-2 text-right ${xlCellClass}`}>
                                    <Tooltip text="What the calibrated model priced this player at the moment they were on the block.">
                                        <span>Model</span>
                                    </Tooltip>
                                </th>
                                <th className="py-2 pr-2 text-right">
                                    <Tooltip text="Paid minus the model's at-the-time price. Red = the room paid over the model; green = under.">
                                        <span>±</span>
                                    </Tooltip>
                                </th>
                            </>
                        )}
                        <th className="py-2 pr-2 text-right">
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
                            <td className={`py-1.5 pr-2 text-gray-500 ${xlCellClass}`}>
                                {pick.pickNumber}
                            </td>
                            <td className="py-1.5 pr-2">
                                {compact && (
                                    <span className="mr-1.5">
                                        <PositionBadge position={pick.player.defaultPosition} />
                                    </span>
                                )}
                                {pick.player.name ?? pick.player.id}
                            </td>
                            {!compact && (
                                <td className="py-1.5 pr-2">
                                    <PositionBadge position={pick.player.defaultPosition} />
                                </td>
                            )}
                            <td className="py-1.5 pr-2 text-gray-500">
                                {teamLabel(pick.teamId)}
                            </td>
                            <td className="py-1.5 pr-2 text-right tabular-nums">
                                ${pick.price}
                            </td>
                            {modelPrices && (
                                <>
                                    <td
                                        className={`py-1.5 pr-2 text-right tabular-nums text-gray-500 ${xlCellClass}`}
                                        data-testid="pick-model"
                                    >
                                        {modelPrices.has(pick.pickNumber)
                                            ? `$${modelPrices.get(pick.pickNumber)}`
                                            : '—'}
                                    </td>
                                    <td
                                        className="py-1.5 pr-2 text-right tabular-nums"
                                        data-testid="pick-paid-delta"
                                    >
                                        {modelPrices.has(pick.pickNumber) ? (
                                            (() => {
                                                const d =
                                                    pick.price - modelPrices.get(pick.pickNumber)!;
                                                return (
                                                    <span className={paidDeltaClass(d)}>
                                                        {d > 0 ? `+$${d}` : d < 0 ? `−$${-d}` : '$0'}
                                                    </span>
                                                );
                                            })()
                                        ) : (
                                            '—'
                                        )}
                                    </td>
                                </>
                            )}
                            <td
                                className="py-1.5 pr-2 text-right tabular-nums text-gray-500"
                                data-testid="pick-delta"
                                title={compact ? formatDelta(pickDeltas.get(pick.pickNumber)) : undefined}
                            >
                                {compact
                                    ? formatDeltaTerse(pickDeltas.get(pick.pickNumber))
                                    : formatDelta(pickDeltas.get(pick.pickNumber))}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default PicksTable;
