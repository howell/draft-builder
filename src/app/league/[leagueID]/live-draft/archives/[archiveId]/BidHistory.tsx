'use client';

/**
 * Per-lot auction timelines for an archived draft: the nominator's opener,
 * every competing bid, passes, and the hammer — the bid-level data the
 * archive persists for appetite/inflation analysis, made browsable with
 * search (player name), filters (position, team, sold/unsold), and metric
 * sorts (price, events, bidders, duration).
 */

import React, { useMemo, useState } from 'react';
import { Card, CardBody } from '@/ui/Card';
import type { ArchivedBid, ArchivedPick } from '@/lib/live-draft/archive';
import {
    DisplayLot,
    LotFilters,
    LotSortKey,
    filterSortLots,
    groupBidLots,
} from './groupBidLots';

interface Props {
    bids: ArchivedBid[];
    picks: ArchivedPick[];
    teamLabel: (teamId: string) => string;
    /** Name/position fallback for unsold lots (their players have no pick row). */
    resolvePlayer?: (playerId: number) => { name?: string; position?: string } | undefined;
}

const chipBase = 'rounded px-1.5 py-0.5 whitespace-nowrap';
const controlClass =
    'h-8 px-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm';

const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST'];
const positionRank = (position: string) => {
    const index = POSITION_ORDER.indexOf(position);
    return index === -1 ? POSITION_ORDER.length : index;
};

const SORT_OPTIONS: { value: LotSortKey; label: string }[] = [
    { value: 'draft', label: 'Draft order' },
    { value: 'price', label: 'Price' },
    { value: 'events', label: 'Bid events' },
    { value: 'bidders', label: 'Bidders' },
    { value: 'duration', label: 'Duration' },
];

const BidHistory: React.FC<Props> = ({ bids, picks, teamLabel, resolvePlayer }) => {
    const [search, setSearch] = useState('');
    const [position, setPosition] = useState('');
    const [teamId, setTeamId] = useState('');
    const [outcome, setOutcome] = useState<LotFilters['outcome']>('all');
    const [sortKey, setSortKey] = useState<LotSortKey>('draft');

    const lots = useMemo(() => groupBidLots(bids, picks), [bids, picks]);

    const displayLots = useMemo<DisplayLot[]>(
        () =>
            lots.map(lot => {
                const fallback = resolvePlayer?.(lot.playerId);
                return {
                    lot,
                    name: lot.playerName ?? fallback?.name ?? `#${lot.playerId}`,
                    position: lot.position ?? fallback?.position ?? null,
                };
            }),
        [lots, resolvePlayer]
    );

    const positionOptions = useMemo(() => {
        const positions = new Set<string>();
        for (const { position: pos } of displayLots) if (pos) positions.add(pos);
        return [...positions].sort(
            (a, b) => positionRank(a) - positionRank(b) || a.localeCompare(b)
        );
    }, [displayLots]);

    // Every team that bid on or won a lot, labeled and name-sorted.
    const teamOptions = useMemo(() => {
        const ids = new Set<number>();
        for (const { lot } of displayLots) {
            if (lot.winningTeamId !== null) ids.add(lot.winningTeamId);
            for (const event of lot.events) if (event.kind !== 'pass') ids.add(event.teamId);
        }
        return [...ids]
            .map(id => ({ id, label: teamLabel(String(id)) }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [displayLots, teamLabel]);

    const visible = useMemo(
        () =>
            filterSortLots(displayLots, {
                search,
                position,
                teamId: teamId === '' ? null : Number(teamId),
                outcome,
                sortKey,
            }),
        [displayLots, search, position, teamId, outcome, sortKey]
    );

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
                    {visible.length !== lots.length &&
                        ` · showing ${visible.length} of ${lots.length}`}
                </p>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                    <input
                        type="search"
                        className={`${controlClass} w-44`}
                        placeholder="Search player…"
                        aria-label="Search players"
                        data-testid="bid-history-search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    <select
                        className={controlClass}
                        aria-label="Filter by position"
                        data-testid="bid-history-position"
                        value={position}
                        onChange={e => setPosition(e.target.value)}
                    >
                        <option value="">All positions</option>
                        {positionOptions.map(pos => (
                            <option key={pos} value={pos}>
                                {pos}
                            </option>
                        ))}
                    </select>
                    <select
                        className={controlClass}
                        aria-label="Filter by bidding team"
                        data-testid="bid-history-team"
                        value={teamId}
                        onChange={e => setTeamId(e.target.value)}
                    >
                        <option value="">All teams</option>
                        {teamOptions.map(team => (
                            <option key={team.id} value={team.id}>
                                {team.label}
                            </option>
                        ))}
                    </select>
                    <select
                        className={controlClass}
                        aria-label="Filter by outcome"
                        data-testid="bid-history-outcome"
                        value={outcome}
                        onChange={e => setOutcome(e.target.value as LotFilters['outcome'])}
                    >
                        <option value="all">Sold + unsold</option>
                        <option value="sold">Sold</option>
                        <option value="unsold">Unsold</option>
                    </select>
                    <select
                        className={controlClass}
                        aria-label="Sort lots"
                        data-testid="bid-history-sort"
                        value={sortKey}
                        onChange={e => setSortKey(e.target.value as LotSortKey)}
                    >
                        {SORT_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
                {visible.length === 0 ? (
                    <p className="text-sm text-gray-500">No lots match the current filters.</p>
                ) : (
                    <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
                        {visible.map(({ lot, name, position: lotPosition }) => (
                            <div
                                key={lot.playerId}
                                data-testid="bid-lot"
                                className="border-b border-gray-100 dark:border-gray-800 pb-2 last:border-b-0"
                            >
                                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                                    <span className="text-gray-500 tabular-nums">
                                        {lot.pickNumber !== null ? `#${lot.pickNumber}` : 'unsold'}
                                    </span>
                                    <span className="font-medium">{name}</span>
                                    {lotPosition && (
                                        <span className="text-gray-500">{lotPosition}</span>
                                    )}
                                    <span className="text-gray-500">
                                        · {lot.distinctBidders} bidder
                                        {lot.distinctBidders === 1 ? '' : 's'}
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
                        ))}
                    </div>
                )}
            </CardBody>
        </Card>
    );
};

export default BidHistory;
