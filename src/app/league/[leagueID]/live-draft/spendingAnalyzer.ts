import { 
    LiveDraftState, 
    SpendingTrends, 
    PositionSpending, 
    RosterAnalysis, 
    PositionNeed, 
    BudgetStatus 
} from '@/app/storage/savedLiveDraftTypes';
import { predictPrice } from '@/app/league/analytics';
import { RankedPlayer } from '@/types/storage';

interface BaselinePredictionContext {
    position: string;
    positionRank: number;
    overallRank: number;
}

/**
 * Analyzes current draft state to generate spending trends and roster analysis
 */
export function analyzeSpendingTrends(draftState: LiveDraftState): SpendingTrends {
    const { picks, settings } = draftState;
    
    if (picks.length === 0) {
        return {
            positionSpending: {},
            overallInflation: 0,
        };
    }

    // Calculate position-by-position spending
    const positionSpending = calculatePositionSpending(picks, settings.totalBudget);
    
    // Calculate overall inflation metrics
    const overallInflation = calculateOverallInflation(picks, settings.totalBudget);

    return {
        positionSpending,
        overallInflation,
    };
}

/**
 * Analyzes roster needs and budget status across all teams
 */
export function analyzeRosterNeeds(draftState: LiveDraftState): RosterAnalysis {
    const { teams, settings } = draftState;
    
    // Calculate unfilled positions across all teams
    const unfilledPositions = calculateUnfilledPositions(teams, settings.rosterSettings);
    
    // Calculate budget status
    const budgetStatus = calculateBudgetStatus(teams);
    
    // Project spending for remaining positions (simplified for now)
    const projectedSpending: Record<string, number> = {};
    for (const [position, need] of Object.entries(unfilledPositions)) {
        if (need.remainingSlots > 0) {
            // Simple projection: remaining slots * average cost so far for this position
            const positionSpending = draftState.stateSnapshot.budgetSpentByPositionPct[position] || 0;
            const currentPicksForPosition = draftState.picks.filter(p => p.player.defaultPosition === position).length;
            if (currentPicksForPosition > 0) {
                const avgCostPct = positionSpending / currentPicksForPosition;
                projectedSpending[position] = avgCostPct * need.remainingSlots * draftState.settings.totalBudget;
            } else {
                projectedSpending[position] = 0;
            }
        }
    }

    return {
        unfilledPositions,
        budgetStatus,
        projectedSpending,
    };
}

/**
 * Calculate spending patterns for each position
 */
function calculatePositionSpending(
    picks: LiveDraftState['picks'], 
    totalBudget: number
): Record<string, PositionSpending> {
    const positionGroups = groupPicksByPosition(picks);
    const result: Record<string, PositionSpending> = {};

    for (const [position, positionPicks] of Object.entries(positionGroups)) {
        if (positionPicks.length === 0) continue;

        const totalSpent = positionPicks.reduce((sum, pick) => sum + pick.price, 0);
        const averagePrice = totalSpent / positionPicks.length;
        const averagePricePct = (averagePrice / totalBudget) * 100;

        // Calculate baseline predictions for comparison
        const predictedTotal = positionPicks.reduce((sum, pick) => {
            return sum + getBaselinePrediction(pick.player, totalBudget);
        }, 0);
        const predictedAverage = predictedTotal / positionPicks.length;
        const predictedAveragePct = (predictedAverage / totalBudget) * 100;

        // Calculate inflation rate
        const inflationRate = predictedAverage > 0 ? 
            ((averagePrice - predictedAverage) / predictedAverage) * 100 : 0;

        result[position] = {
            position,
            averagePricePct,
            predictedAveragePct,
            inflationRate,
            pickCount: positionPicks.length,
        };
    }

    return result;
}

/**
 * Calculate overall inflation across all picks
 */
function calculateOverallInflation(
    picks: LiveDraftState['picks'], 
    totalBudget: number
): number {
    if (picks.length === 0) return 0;

    const totalActual = picks.reduce((sum, pick) => sum + pick.price, 0);
    const totalPredicted = picks.reduce((sum, pick) => {
        return sum + getBaselinePrediction(pick.player, totalBudget);
    }, 0);

    return totalPredicted > 0 ? ((totalActual - totalPredicted) / totalPredicted) * 100 : 0;
}


/**
 * Group picks by position
 */
function groupPicksByPosition(picks: LiveDraftState['picks']): Record<string, LiveDraftState['picks']> {
    return picks.reduce((groups, pick) => {
        const position = pick.player.defaultPosition;
        if (!groups[position]) {
            groups[position] = [];
        }
        groups[position].push(pick);
        return groups;
    }, {} as Record<string, LiveDraftState['picks']>);
}

/**
 * Calculate unfilled positions across all teams
 */
function calculateUnfilledPositions(
    teams: LiveDraftState['teams'], 
    rosterSettings: LiveDraftState['settings']['rosterSettings']
): Record<string, PositionNeed> {
    const result: Record<string, PositionNeed> = {};

    // Count total slots needed for each position across all teams
    const totalSlotsNeeded: Record<string, number> = {};
    
    for (const team of teams) {
        for (const slot of team.rosterSlots) {
            const positions = Array.isArray(slot.position) ? slot.position : [slot.position];
            for (const position of positions) {
                totalSlotsNeeded[position] = (totalSlotsNeeded[position] || 0) + 1;
            }
        }
    }

    // Count filled slots for each position
    const totalSlotsFilled: Record<string, number> = {};
    for (const team of teams) {
        for (const [position, count] of Object.entries(team.filledPositions)) {
            totalSlotsFilled[position] = (totalSlotsFilled[position] || 0) + count;
        }
    }

    // Calculate needs for each position
    for (const [position, totalSlots] of Object.entries(totalSlotsNeeded)) {
        const filledSlots = totalSlotsFilled[position] || 0;
        const remainingSlots = Math.max(0, totalSlots - filledSlots);
        
        // Count teams that still need this position
        const teamsNeedingPosition = teams.filter(team => {
            const teamFilled = team.filledPositions[position] || 0;
            const teamNeeds = team.rosterSlots.filter(slot => {
                const positions = Array.isArray(slot.position) ? slot.position : [slot.position];
                return positions.includes(position);
            }).length;
            return teamFilled < teamNeeds;
        }).length;

        result[position] = {
            position,
            totalSlots,
            filledSlots,
            remainingSlots,
            teamsNeedingPosition,
        };
    }

    return result;
}

/**
 * Calculate budget status across all teams
 */
function calculateBudgetStatus(teams: LiveDraftState['teams']): BudgetStatus {
    if (teams.length === 0) {
        return {
            averageRemaining: 0,
            highestRemaining: { teamId: '', amount: 0 },
            lowestRemaining: { teamId: '', amount: 0 },
            teamsInTrouble: 0,
        };
    }

    const remainingBudgets = teams.map(team => ({
        teamId: team.id,
        amount: team.remainingBudget,
    }));

    const totalRemaining = remainingBudgets.reduce((sum, team) => sum + team.amount, 0);
    const averageRemaining = totalRemaining / teams.length;

    const sortedByBudget = remainingBudgets.sort((a, b) => b.amount - a.amount);
    const highestRemaining = sortedByBudget[0];
    const lowestRemaining = sortedByBudget[sortedByBudget.length - 1];

    // Teams in trouble: less than 10% of original budget remaining
    const teamsInTrouble = teams.filter(team => {
        const originalBudget = team.budget;
        const remainingPct = (team.remainingBudget / originalBudget) * 100;
        return remainingPct < 10;
    }).length;

    return {
        averageRemaining,
        highestRemaining,
        lowestRemaining,
        teamsInTrouble,
    };
}

/**
 * Get baseline price prediction for a player (using existing exponential model)
 * This is a simplified version - in a full implementation, this would use
 * the existing analytics system with proper regression models
 */
function getBaselinePrediction(player: RankedPlayer, totalBudget: number): number {
    // Simplified baseline prediction based on rank
    // In practice, this should use the existing predictPrice function with proper regression
    const basePrice = Math.max(1, 100 - (player.overallRank * 0.5));
    return Math.round(basePrice);
}