'use client';

import React, { useMemo } from 'react';
import { SpendingTrends as SpendingTrendsType, PositionSpending } from '@/app/storage/savedLiveDraftTypes';
import { Card, CardBody, CardHeader } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { PositionBadge } from '@/ui/Badge';
import { LIVE_DRAFT_CONSTANTS } from './constants';
import { format, ui, arrays } from './utils';
import { EmptyState, AlertBox, PriceDifference } from './components/common';

export interface SpendingTrendsProps {
    trends: SpendingTrendsType;
    totalBudget?: number;
}

// Component for individual position spending row
const PositionSpendingRow: React.FC<{
    position: PositionSpending;
    totalBudget: number;
}> = ({ position, totalBudget }) => {
    const actualPrice = Math.round(position.averagePricePct * totalBudget / 100);
    const predictedPrice = Math.round(position.predictedAveragePct * totalBudget / 100);
    const difference = actualPrice - predictedPrice;
    
    return (
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center gap-3">
                <PositionBadge position={position.position} />
                <div className="text-sm">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                        {format.currency(actualPrice)} avg
                        <span className="text-gray-500 dark:text-gray-400 ml-1">
                            ({position.pickCount} pick{position.pickCount !== 1 ? 's' : ''})
                        </span>
                    </div>
                    <div className="text-gray-600 dark:text-gray-400">
                        Predicted: {format.currency(predictedPrice)}
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-2">
                <Badge 
                    variant={ui.getInflationBadgeVariant(position.inflationRate)}
                    size="sm"
                >
                    {format.percentage(position.inflationRate)}
                </Badge>
                <PriceDifference difference={difference} />
            </div>
        </div>
    );
};

// Component for market insights cards
const MarketInsights: React.FC<{
    positions: PositionSpending[];
}> = ({ positions }) => {
    const mostInflated = useMemo(() => 
        positions.reduce((max, pos) => pos.inflationRate > max.inflationRate ? pos : max),
        [positions]
    );
    
    const bestValue = useMemo(() => 
        positions.reduce((min, pos) => pos.inflationRate < min.inflationRate ? pos : min),
        [positions]
    );

    if (positions.length === 0) return null;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="text-sm">
                    <div className="font-medium text-red-900 dark:text-red-100">
                        Most Inflated
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <PositionBadge position={mostInflated.position} />
                        <span className="text-red-700 dark:text-red-300">
                            {format.percentage(mostInflated.inflationRate)}
                        </span>
                    </div>
                </div>
            </div>
            
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                <div className="text-sm">
                    <div className="font-medium text-green-900 dark:text-green-100">
                        Best Value
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <PositionBadge position={bestValue.position} />
                        <span className="text-green-700 dark:text-green-300">
                            {format.percentage(bestValue.inflationRate)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Component for market alerts based on inflation
const MarketAlerts: React.FC<{
    overallInflation: number;
}> = ({ overallInflation }) => {
    if (overallInflation > LIVE_DRAFT_CONSTANTS.HIGH_INFLATION_THRESHOLD) {
        return (
            <AlertBox variant="error" className="mt-3">
                <strong>High inflation detected!</strong> Players are going for significantly more than predicted.
            </AlertBox>
        );
    }
    
    if (overallInflation < -LIVE_DRAFT_CONSTANTS.MEDIUM_INFLATION_THRESHOLD) {
        return (
            <AlertBox variant="success" className="mt-3">
                <strong>Market undervaluing!</strong> Players are going for less than predicted - potential value opportunities.
            </AlertBox>
        );
    }
    
    return null;
};

const SpendingTrends: React.FC<SpendingTrendsProps> = ({ 
    trends, 
    totalBudget = LIVE_DRAFT_CONSTANTS.DEFAULT_TOTAL_BUDGET
}) => {
    const { positionSpending, overallInflation } = trends;

    // Memoized sorted positions by average price (highest first)
    const sortedPositions = useMemo(() => 
        arrays.sortPositionsByPrice(Object.values(positionSpending), totalBudget),
        [positionSpending, totalBudget]
    );

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Spending Trends
                    </h3>
                    <Badge 
                        variant={ui.getInflationBadgeVariant(overallInflation)}
                        size="lg"
                    >
                        {format.percentage(overallInflation)} Inflation
                    </Badge>
                </div>
            </CardHeader>
            
            <CardBody className="space-y-4">
                {sortedPositions.length === 0 ? (
                    <EmptyState 
                        title="No spending data available yet"
                        message="Start drafting to see spending trends"
                    />
                ) : (
                    <>
                        {/* Position by position breakdown */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                                Position Spending vs Predicted
                            </h4>
                            
                            {sortedPositions.map(position => (
                                <PositionSpendingRow 
                                    key={position.position}
                                    position={position}
                                    totalBudget={totalBudget}
                                />
                            ))}
                        </div>

                        {/* Overall summary */}
                        <div className="mt-6 p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-medium text-primary-900 dark:text-primary-100">
                                        Market Summary
                                    </h4>
                                    <p className="text-sm text-primary-700 dark:text-primary-300">
                                        Overall spending compared to predictions
                                    </p>
                                </div>
                                <div className="text-right">
                                    <div className="text-lg font-bold text-primary-900 dark:text-primary-100">
                                        {format.percentage(overallInflation)}
                                    </div>
                                    <div className="text-sm text-primary-700 dark:text-primary-300">
                                        {overallInflation > 0 ? 'Above' : overallInflation < 0 ? 'Below' : 'At'} Expected
                                    </div>
                                </div>
                            </div>
                            
                            <MarketAlerts overallInflation={overallInflation} />
                        </div>

                        {/* Market insights */}
                        <div className="mt-4">
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Market Insights
                            </h4>
                            <MarketInsights positions={sortedPositions} />
                        </div>
                    </>
                )}
            </CardBody>
        </Card>
    );
};

export default SpendingTrends;