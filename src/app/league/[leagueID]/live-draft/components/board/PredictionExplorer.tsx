'use client';

import React from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/Card';
import { PositionBadge } from '@/ui/Badge';
import Tooltip from '@/ui/Tooltip';
import { PricePredictor, PredictorPlayer } from '@/lib/models/live-draft/predictor';
import { MODEL_HELP } from '../SimulatorGuide';
import { shortPlayerName } from './format';

export interface ExplorerRow {
    player: PredictorPlayer & { name?: string };
    prices: number[];
}

/** Column-mode header abbreviations; full labels stay in the tooltips. */
const SHORT_LABELS: Record<string, string> = {
    baseline: 'Base',
    sticker: 'Sticker',
    inflation: 'Infl',
};

interface Props {
    title: React.ReactNode;
    /** e.g. the simulator's Train-regression control; omitted on the live board. */
    headerRight?: React.ReactNode;
    /** One price column per predictor, in order — rows' prices must match. */
    predictors: PricePredictor[];
    rows: ExplorerRow[];
    /** When set, rows are clickable (the live board's click-to-plan). */
    onRowClick?: (playerId: string) => void;
    /** Rendered between the header and the table (the live board's filters). */
    subHeader?: React.ReactNode;
    /** Scroll the table internally with a sticky header (the live board's
     *  two-column layout) instead of growing the page. */
    scrollBody?: boolean;
}

/** Available players priced by each model — shared by simulator and live board. */
const PredictionExplorer: React.FC<Props> = ({ title, headerRight, predictors, rows, onRowClick, subHeader, scrollBody }) => (
    <Card>
        <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{title}</CardTitle>
                {headerRight}
            </div>
        </CardHeader>
        <CardBody>
            {subHeader}
            <div
                className={`overflow-x-auto${scrollBody ? ' max-h-[70vh] overflow-y-auto' : ''}`}
                data-testid="prediction-explorer"
            >
                <table className="w-full text-sm">
                    <thead className={scrollBody ? 'sticky top-0 z-10 bg-white dark:bg-gray-900' : undefined}>
                        <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                            <th className="py-2 pr-2">Rank</th>
                            <th className="py-2 pr-2">Player</th>
                            <th className="py-2 pr-2">Pos</th>
                            {predictors.map(p => (
                                <th key={p.id} className="py-2 pr-2 text-right">
                                    <Tooltip text={MODEL_HELP[p.id] ?? p.label}>
                                        <span>
                                            {scrollBody ? (SHORT_LABELS[p.id] ?? p.label) : p.label}
                                        </span>
                                    </Tooltip>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(({ player, prices }) => {
                            const name = player.name ?? player.id;
                            return (
                            <tr
                                key={player.id}
                                className={`border-b border-gray-100 dark:border-gray-800${
                                    onRowClick
                                        ? ' cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40'
                                        : ''
                                }`}
                                onClick={onRowClick ? () => onRowClick(player.id) : undefined}
                            >
                                <td className="py-1.5 pr-2">{player.overallRank + 1}</td>
                                <td className="py-1.5 pr-2 max-w-28 sm:max-w-none truncate">
                                    {/* Column mode lives in a half-width grid cell, so viewport
                                        breakpoints can't judge the fit — always abbreviate. */}
                                    {scrollBody ? (
                                        <span title={name}>
                                            {shortPlayerName(name, player.defaultPosition)}
                                        </span>
                                    ) : (
                                        <>
                                            <span className="sm:hidden">
                                                {shortPlayerName(name, player.defaultPosition)}
                                            </span>
                                            <span className="hidden sm:inline">{name}</span>
                                        </>
                                    )}
                                </td>
                                <td className="py-1.5 pr-2">
                                    <PositionBadge position={player.defaultPosition} />
                                </td>
                                {prices.map((price, i) => (
                                    <td key={i} className="py-1.5 pr-2 text-right tabular-nums">
                                        ${price}
                                    </td>
                                ))}
                            </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </CardBody>
    </Card>
);

export default PredictionExplorer;
