'use client';

/**
 * Read-only rows for the "my roster" planner: locked real picks and sniped
 * plan entries. Editable open slots use MockRosterEntry instead.
 */

import React from 'react';
import { PositionBadge } from '@/ui/Badge';
import {
    RosterPlanRowLocked,
    RosterPlanRowPlanned,
} from '@/lib/models/live-draft/rosterPlan';

export const LockedRosterRow: React.FC<{ row: RosterPlanRowLocked }> = ({ row }) => (
    <tr
        data-testid={`locked-roster-${row.slot.position}-${row.slot.index}`}
        className="border-b border-gray-200 dark:border-gray-700"
    >
        <td className="py-1.5 pr-1 sm:px-2 whitespace-nowrap">
            <PositionBadge position={row.slot.position} />
        </td>
        <td className="py-1.5 px-1 sm:px-2 w-full">
            <span className="text-gray-900 dark:text-gray-100">
                {row.pick.player.name ?? `#${row.pick.player.id}`}
            </span>
            {row.overflow && (
                <span className="ml-2 text-xs text-gray-500">no open slot</span>
            )}
        </td>
        <td className="py-1.5 px-1 whitespace-nowrap">
            <span className="font-semibold text-gray-900 dark:text-gray-100">
                ${row.pick.price}
            </span>
            <i className="fas fa-lock ml-2 text-xs text-gray-400" title="drafted" />
        </td>
    </tr>
);

export const SnipedRosterRow: React.FC<{
    row: RosterPlanRowPlanned;
    teamLabel: (teamId: string) => string;
    onClear: () => void;
}> = ({ row, teamLabel, onClear }) => (
    <tr
        data-testid={`sniped-roster-${row.slot.position}-${row.slot.index}`}
        className="border-b border-gray-200 dark:border-gray-700"
    >
        <td className="py-1.5 pr-1 sm:px-2 whitespace-nowrap">
            <PositionBadge position={row.slot.position} />
        </td>
        <td className="py-1.5 px-1 sm:px-2 w-full">
            <span className="line-through text-red-600 dark:text-red-400">
                {row.player?.name ?? `player ${row.playerId}`}
            </span>
            <span className="ml-2 text-xs text-red-600/80 dark:text-red-400/80">
                {row.snipedBy
                    ? `gone to ${teamLabel(row.snipedBy.teamId)} for $${row.snipedBy.price}`
                    : 'not in player pool'}
            </span>
        </td>
        <td className="py-1.5 px-1 whitespace-nowrap">
            <button
                onClick={onClear}
                className="text-xs underline text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
                Clear
            </button>
        </td>
    </tr>
);
