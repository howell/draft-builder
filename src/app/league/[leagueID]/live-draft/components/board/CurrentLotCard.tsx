'use client';

import React from 'react';
import { Card, CardBody } from '@/ui/Card';
import { PositionBadge } from '@/ui/Badge';
import Tooltip from '@/ui/Tooltip';
import { LiveLot } from '@/lib/models/live-draft/liveBoard';

const LOT_HELP =
    'The player on the clock: the room\'s current bid against the calibrated model\'s price. ' +
    'Green = the model thinks there\'s value left at this bid; red = the bidding has passed the model.';

interface Props {
    lot: LiveLot;
    /** The calibrated inflation model's price for the player, when computable. */
    modelPrice: number | null;
    teamLabel: (teamId: string) => string;
}

/** The on-the-clock callout: current bid vs the model, at a glance. */
const CurrentLotCard: React.FC<Props> = ({ lot, modelPrice, teamLabel }) => {
    const gap = modelPrice !== null ? modelPrice - lot.currentBid : null;
    return (
        <Card data-testid="current-lot">
            <CardBody>
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Tooltip text={LOT_HELP}>
                            <span className="text-sm text-gray-500">On the clock</span>
                        </Tooltip>
                        <span className="text-xl font-bold">
                            {lot.player.name ?? lot.player.id}
                        </span>
                        <PositionBadge position={lot.player.defaultPosition} />
                    </div>
                    <div className="flex flex-wrap items-baseline gap-4">
                        <span className="text-sm text-gray-500">
                            bid{' '}
                            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                ${lot.currentBid}
                            </span>
                            {lot.leadingTeamId !== null && (
                                <span> — {teamLabel(lot.leadingTeamId)}</span>
                            )}
                        </span>
                        <span className="text-sm text-gray-500">
                            model{' '}
                            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                {modelPrice !== null ? `$${modelPrice}` : '—'}
                            </span>
                        </span>
                        {gap !== null && (
                            <span
                                data-testid="lot-gap"
                                className={`text-sm font-medium ${
                                    gap > 0
                                        ? 'text-green-600 dark:text-green-400'
                                        : gap < 0
                                          ? 'text-red-600 dark:text-red-400'
                                          : 'text-gray-500'
                                }`}
                            >
                                {gap > 0
                                    ? `$${gap} under model`
                                    : gap < 0
                                      ? `$${-gap} past model`
                                      : 'at model'}
                            </span>
                        )}
                        <span className="text-xs text-gray-500">
                            {lot.biddingTeamIds.length} bidder
                            {lot.biddingTeamIds.length === 1 ? '' : 's'}
                        </span>
                    </div>
                </div>
            </CardBody>
        </Card>
    );
};

export default CurrentLotCard;
