'use client';

/**
 * The game-day board's sticky status strip: the on-the-clock lot and every
 * number you glance at during a bidding war — picks, spent, inflation, my
 * remaining budget and max bid — in one always-visible row. Replaces the
 * stacked StatTiles + CurrentLotCard on the board (the simulator and archive
 * pages keep the card forms).
 */

import React from 'react';
import { PositionBadge } from '@/ui/Badge';
import Tooltip from '@/ui/Tooltip';
import { LiveLot } from '@/lib/models/live-draft/liveBoard';
import { RosterPlanBudget } from '@/lib/models/live-draft/rosterPlan';
import { HELP } from '../SimulatorGuide';

const LOT_HELP =
    "The player on the clock: the room's current bid against the calibrated model's price. " +
    'Green = the model thinks there is value left at this bid; red = the bidding has passed the model.';

interface Props {
    lot: LiveLot | null;
    /** The calibrated inflation model's price for the lot player, when computable. */
    lotModelPrice: number | null;
    teamLabel: (teamId: string) => string;
    picksCount: number;
    spent: number;
    totalPool: number;
    inflationGlobal: number | null;
    /** My budget summary from the roster plan; null before a team is known. */
    planBudget: RosterPlanBudget | null;
}

const Divider = () => (
    <span aria-hidden className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
);

const StatusBand: React.FC<Props> = ({
    lot,
    lotModelPrice,
    teamLabel,
    picksCount,
    spent,
    totalPool,
    inflationGlobal,
    planBudget,
}) => {
    const gap = lot && lotModelPrice !== null ? lotModelPrice - lot.currentBid : null;

    return (
        <div
            data-testid="status-band"
            className="sticky top-0 z-40 -mx-4 px-4 py-2 mb-1
                       bg-white/95 dark:bg-gray-900/95 backdrop-blur
                       border-b border-gray-200 dark:border-gray-700
                       flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
        >
            {lot ? (
                <span data-testid="current-lot" className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Tooltip text={LOT_HELP}>
                        <span className="text-gray-500">On the clock</span>
                    </Tooltip>
                    <span className="font-bold text-base">{lot.player.name ?? lot.player.id}</span>
                    <PositionBadge position={lot.player.defaultPosition} />
                    <span className="text-gray-500">
                        bid <span className="font-bold text-gray-900 dark:text-gray-100">${lot.currentBid}</span>
                        {lot.leadingTeamId !== null && <span> — {teamLabel(lot.leadingTeamId)}</span>}
                    </span>
                    <span className="text-gray-500">
                        model{' '}
                        <span className="font-bold text-gray-900 dark:text-gray-100">
                            {lotModelPrice !== null ? `$${lotModelPrice}` : '—'}
                        </span>
                    </span>
                    {gap !== null && (
                        <span
                            data-testid="lot-gap"
                            className={`font-medium ${
                                gap > 0
                                    ? 'text-green-600 dark:text-green-400'
                                    : gap < 0
                                      ? 'text-red-600 dark:text-red-400'
                                      : 'text-gray-500'
                            }`}
                        >
                            {gap > 0 ? `$${gap} under model` : gap < 0 ? `$${-gap} past model` : 'at model'}
                        </span>
                    )}
                    <span className="text-xs text-gray-500">
                        {lot.biddingTeamIds.length} bidder{lot.biddingTeamIds.length === 1 ? '' : 's'}
                    </span>
                </span>
            ) : (
                <span className="text-gray-400 dark:text-gray-500">between lots</span>
            )}

            <span className="grow" />

            <span className="text-gray-500">
                picks <span className="font-semibold text-gray-900 dark:text-gray-100">{picksCount}</span>
            </span>
            <Divider />
            <Tooltip text={HELP.spent}>
                <span className="text-gray-500">
                    spent{' '}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                        ${spent}
                    </span>
                    <span className="text-gray-400"> / ${totalPool}</span>
                </span>
            </Tooltip>
            <Divider />
            <Tooltip text={HELP.globalInflation}>
                <span className="text-gray-500">
                    infl{' '}
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {inflationGlobal !== null ? `${inflationGlobal.toFixed(2)}×` : '—×'}
                    </span>
                </span>
            </Tooltip>
            {planBudget && (
                <>
                    <Divider />
                    <span className="text-gray-500">
                        mine{' '}
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                            ${planBudget.remaining}
                        </span>
                        <span className="text-gray-400"> left</span>
                    </span>
                    <span className="text-gray-500">
                        max bid{' '}
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                            ${planBudget.maxBid}
                        </span>
                    </span>
                </>
            )}
        </div>
    );
};

export default StatusBand;
