'use client';

/**
 * Per-lot auction timelines for an archived draft: the nominator's opener,
 * every competing bid, passes, and the hammer — the bid-level data the
 * archive persists for appetite/inflation analysis, made browsable.
 */

import React, { useMemo } from 'react';
import { Card, CardBody } from '@/ui/Card';
import type { ArchivedBid, ArchivedPick } from '@/lib/live-draft/archive';
import { groupBidLots } from './groupBidLots';

interface Props {
    bids: ArchivedBid[];
    picks: ArchivedPick[];
    teamLabel: (teamId: string) => string;
    /** Name/position fallback for unsold lots (their players have no pick row). */
    resolvePlayer?: (playerId: number) => { name?: string; position?: string } | undefined;
}

const chipBase = 'rounded px-1.5 py-0.5 whitespace-nowrap';

const BidHistory: React.FC<Props> = ({ bids, picks, teamLabel, resolvePlayer }) => {
    const lots = useMemo(() => groupBidLots(bids, picks), [bids, picks]);
    const unobservedPicks = picks.length - lots.filter(l => l.pickNumber !== null).length;

    if (lots.length === 0) return null;

    return (
        <Card data-testid="bid-history">
            <CardBody>
                <h3 className="text-lg font-semibold mb-1">Bid history</h3>
                <p className="text-sm text-gray-500 mb-3">
                    {lots.length} lot{lots.length === 1 ? '' : 's'} · {bids.length} events
                    {unobservedPicks > 0 &&
                        ` · ${unobservedPicks} pick${unobservedPicks === 1 ? '' : 's'} without observed bidding (INIT catch-up)`}
                </p>
                <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
                    {lots.map(lot => {
                        const fallback = resolvePlayer?.(lot.playerId);
                        const name = lot.playerName ?? fallback?.name ?? `#${lot.playerId}`;
                        const position = lot.position ?? fallback?.position;
                        return (
                            <div
                                key={lot.playerId}
                                className="border-b border-gray-100 dark:border-gray-800 pb-2 last:border-b-0"
                            >
                                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                                    <span className="text-gray-500 tabular-nums">
                                        {lot.pickNumber !== null ? `#${lot.pickNumber}` : 'unsold'}
                                    </span>
                                    <span className="font-medium">{name}</span>
                                    {position && <span className="text-gray-500">{position}</span>}
                                    <span className="text-gray-500">
                                        · {lot.distinctBidders} bidder{lot.distinctBidders === 1 ? '' : 's'}
                                        {lot.durationMs !== null &&
                                            ` · ${Math.round(lot.durationMs / 1000)}s`}
                                    </span>
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                                    {lot.events.map(event => (
                                        <span
                                            key={event.seq}
                                            className={
                                                event.kind === 'pass'
                                                    ? `${chipBase} bg-gray-50 dark:bg-gray-800/60 text-gray-400 line-through`
                                                    : event.kind === 'open'
                                                      ? `${chipBase} bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300`
                                                      : `${chipBase} bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300`
                                            }
                                            title={event.kind}
                                        >
                                            {event.kind === 'pass'
                                                ? teamLabel(String(event.teamId))
                                                : `${teamLabel(String(event.teamId))} $${event.amount}`}
                                        </span>
                                    ))}
                                    {lot.price !== null && lot.winningTeamId !== null && (
                                        <span className="whitespace-nowrap font-medium text-accent-700 dark:text-accent-300">
                                            → sold ${lot.price} · {teamLabel(String(lot.winningTeamId))}
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </CardBody>
        </Card>
    );
};

export default BidHistory;
