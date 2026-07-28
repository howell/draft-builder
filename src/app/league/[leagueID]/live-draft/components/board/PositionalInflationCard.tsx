'use client';

import React from 'react';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import Tooltip from '@/ui/Tooltip';
import { InflationField } from '@/lib/models/live-draft/inflationModel';
import { HELP } from '../SimulatorGuide';

/** Per-position inflation badges, amber when hotter than the global market. */
const PositionalInflationCard: React.FC<{ field: InflationField }> = ({ field }) => (
    <Card>
        <CardHeader>
            <CardTitle>
                <Tooltip text={HELP.positionalInflation}>
                    <span>Positional inflation</span>
                </Tooltip>
            </CardTitle>
        </CardHeader>
        <CardBody>
            <div className="flex flex-wrap gap-2">
                {Object.entries(field.byPosition)
                    .sort((a, b) => b[1] - a[1])
                    .map(([pos, factor]) => (
                        <Badge
                            key={pos}
                            variant={factor > field.global ? 'warning' : 'info'}
                        >
                            {pos}: {factor.toFixed(2)}×
                        </Badge>
                    ))}
            </div>
        </CardBody>
    </Card>
);

export default PositionalInflationCard;
