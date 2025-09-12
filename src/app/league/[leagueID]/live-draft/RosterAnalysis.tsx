'use client';

import React, { useMemo } from 'react';
import { RosterAnalysis as RosterAnalysisType, PositionNeed } from '@/app/storage/savedLiveDraftTypes';
import { Card, CardBody, CardHeader } from '@/ui/Card';
import { Badge } from '@/ui/Badge';
import { PositionBadge } from '@/ui/Badge';
import { LIVE_DRAFT_CONSTANTS } from './constants';
import { format, ui, arrays } from './utils';
import { StatCard, AlertBox, EmptyState } from './components/common';

export interface RosterAnalysisProps {
    analysis: RosterAnalysisType;
    totalBudget?: number;
    teamCount?: number;
}

// Component for budget status overview cards
const BudgetStatusCards: React.FC<{
    budgetStatus: RosterAnalysisType['budgetStatus'];
}> = ({ budgetStatus }) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
            title="Average Remaining"
            value={format.currency(budgetStatus.averageRemaining)}
            subtitle="per team"
            variant="info"
        />
        
        <StatCard
            title="Highest Budget"
            value={format.currency(budgetStatus.highestRemaining.amount)}
            subtitle={budgetStatus.highestRemaining.teamId}
            variant="success"
        />
        
        <StatCard
            title="Lowest Budget"
            value={format.currency(budgetStatus.lowestRemaining.amount)}
            subtitle={budgetStatus.lowestRemaining.teamId}
            variant="error"
        />
    </div>
);

// Component for teams in trouble alert
const TeamsInTroubleAlert: React.FC<{
    teamsInTrouble: number;
}> = ({ teamsInTrouble }) => {
    if (teamsInTrouble === 0) return null;

    return (
        <AlertBox variant="warning" icon="⚠️">
            <div className="font-medium">
                {teamsInTrouble} team{teamsInTrouble !== 1 ? 's' : ''} 
                {teamsInTrouble === 1 ? ' has' : ' have'} low budget remaining
            </div>
            <p className="text-sm mt-1">
                Teams with less than ${LIVE_DRAFT_CONSTANTS.CRITICAL_BUDGET_WARNING} remaining may struggle to fill roster spots
            </p>
        </AlertBox>
    );
};

// Component for unfilled positions list
const UnfilledPositionsList: React.FC<{
    positions: PositionNeed[];
    teamCount: number;
}> = ({ positions, teamCount }) => {
    if (positions.length === 0) {
        return (
            <EmptyState 
                title="All starting positions filled!"
                message="Teams are working on bench spots"
            />
        );
    }

    return (
        <div className="space-y-3">
            {positions.map(position => {
                const remainingSlots = position.totalSlots - position.filledSlots;
                const urgencyInfo = ui.getPositionUrgencyInfo(position);
                const teamsNeedingPosition = Math.ceil(remainingSlots / (position.totalSlots / teamCount));
                
                return (
                    <div key={position.position} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                        <div className="flex items-center gap-3">
                            <PositionBadge position={position.position} />
                            <div>
                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                    {position.filledSlots}/{position.totalSlots} filled
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                    {remainingSlots} slot{remainingSlots !== 1 ? 's' : ''} remaining
                                </div>
                            </div>
                        </div>
                        
                        <div className="text-right">
                            <Badge 
                                variant={urgencyInfo.variant}
                                size="sm"
                            >
                                {urgencyInfo.label}
                            </Badge>
                            <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                ~{teamsNeedingPosition} teams need
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// Component for position progress bars
const PositionProgressBars: React.FC<{
    positions: PositionNeed[];
}> = ({ positions }) => {
    if (positions.length === 0) return null;

    return (
        <div className="space-y-3">
            {positions.map(position => {
                const filledPct = (position.filledSlots / position.totalSlots) * 100;
                
                return (
                    <div key={`progress-${position.position}`} className="space-y-1">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <PositionBadge position={position.position} />
                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                    {position.filledSlots}/{position.totalSlots}
                                </span>
                            </div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                {format.percentageAbsolute(filledPct)}
                            </span>
                        </div>
                        
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                                className={`h-2 rounded-full transition-all duration-300 ${
                                    filledPct >= LIVE_DRAFT_CONSTANTS.POSITION_URGENCY.LOW ? 'bg-green-500' :
                                    filledPct >= LIVE_DRAFT_CONSTANTS.POSITION_URGENCY.MEDIUM ? 'bg-blue-500' :
                                    filledPct >= LIVE_DRAFT_CONSTANTS.POSITION_URGENCY.HIGH ? 'bg-yellow-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${Math.min(100, filledPct)}%` }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// Component for projected spending
const ProjectedSpending: React.FC<{
    projectedSpending: Record<string, number>;
}> = ({ projectedSpending }) => {
    const sortedSpending = useMemo(() => 
        Object.entries(projectedSpending).sort(([, a], [, b]) => b - a),
        [projectedSpending]
    );

    if (sortedSpending.length === 0) return null;

    return (
        <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                Projected Remaining Spending
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {sortedSpending.map(([position, projectedCost]) => (
                    <div key={position} className="flex items-center justify-between p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                        <div className="flex items-center gap-2">
                            <PositionBadge position={position} />
                            <span className="text-sm text-primary-900 dark:text-primary-100">
                                Remaining {position}s
                            </span>
                        </div>
                        <div className="text-primary-700 dark:text-primary-300 font-medium">
                            ~{format.currency(projectedCost)}
                        </div>
                    </div>
                ))}
            </div>
            
            <AlertBox variant="info" className="mt-3">
                <strong>💡 Strategy Tip:</strong> Positions with high remaining projected spending may see increased competition and price inflation.
            </AlertBox>
        </div>
    );
};

const RosterAnalysis: React.FC<RosterAnalysisProps> = ({ 
    analysis, 
    totalBudget = LIVE_DRAFT_CONSTANTS.DEFAULT_TOTAL_BUDGET,
    teamCount = LIVE_DRAFT_CONSTANTS.DEFAULT_TEAM_COUNT
}) => {
    const { unfilledPositions, budgetStatus, projectedSpending } = analysis;

    // Memoized sorted unfilled positions by urgency (most urgent first)
    const sortedUnfilledPositions = useMemo(() => 
        arrays.sortUnfilledPositionsByUrgency(Object.values(unfilledPositions)),
        [unfilledPositions]
    );

    return (
        <Card>
            <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Roster Analysis
                </h3>
            </CardHeader>
            
            <CardBody className="space-y-6">
                {/* Budget Status Overview */}
                <BudgetStatusCards budgetStatus={budgetStatus} />

                {/* Teams in Trouble Alert */}
                <TeamsInTroubleAlert teamsInTrouble={budgetStatus.teamsInTrouble} />

                {/* Unfilled Positions */}
                <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                        Unfilled Starting Positions
                    </h4>
                    <UnfilledPositionsList 
                        positions={sortedUnfilledPositions}
                        teamCount={teamCount}
                    />
                </div>

                {/* Position Progress Bars */}
                {sortedUnfilledPositions.length > 0 && (
                    <div>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                            Draft Completion by Position
                        </h4>
                        <PositionProgressBars positions={sortedUnfilledPositions} />
                    </div>
                )}

                {/* Projected Spending */}
                {Object.keys(projectedSpending).length > 0 && (
                    <ProjectedSpending projectedSpending={projectedSpending} />
                )}
            </CardBody>
        </Card>
    );
};

export default RosterAnalysis;