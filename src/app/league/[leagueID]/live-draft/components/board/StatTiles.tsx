'use client';

import React from 'react';
import { Card, CardBody } from '@/ui/Card';
import Tooltip from '@/ui/Tooltip';
import { HELP } from '../SimulatorGuide';

interface Props {
    picksCount: number;
    spent: number;
    totalPool: number;
    inflationGlobal: number | null;
}

/** The three at-a-glance tiles shared by the simulator and the game-day board. */
const StatTiles: React.FC<Props> = ({ picksCount, spent, totalPool, inflationGlobal }) => (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
            <CardBody>
                <div className="text-sm text-gray-500">Picks made</div>
                <div className="text-2xl font-bold">{picksCount}</div>
            </CardBody>
        </Card>
        <Card>
            <CardBody>
                <div className="text-sm text-gray-500">
                    <Tooltip text={HELP.spent}>
                        <span>Spent / total</span>
                    </Tooltip>
                </div>
                <div className="text-2xl font-bold">
                    ${spent} / ${totalPool}
                </div>
            </CardBody>
        </Card>
        <Card>
            <CardBody>
                <div className="text-sm text-gray-500">
                    <Tooltip text={HELP.globalInflation}>
                        <span>Global inflation</span>
                    </Tooltip>
                </div>
                <div className="text-2xl font-bold">
                    {inflationGlobal !== null ? inflationGlobal.toFixed(2) : '—'}×
                </div>
            </CardBody>
        </Card>
    </div>
);

export default StatTiles;
