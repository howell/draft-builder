import { LeagueId, SeasonId } from "@/platforms/common";
import { RosterSettings, LeagueTeam } from "@/platforms/PlatformApi";
import { RankedPlayer, EstimationSettingsState, SearchSettingsState, RosterSlot, CostEstimatedPlayer } from "@/types/storage";

// Core live draft data types
export interface LiveDraftPick {
    pickNumber: number;
    teamId: string;
    teamName: string;
    player: RankedPlayer;
    price: number;
    timestamp: Date;
}

export interface LiveDraftState {
    leagueId: LeagueId;
    draftId: string;
    draftName: string;
    created: number;
    modified: number;
    picks: LiveDraftPick[];
    teams: DraftTeam[];
    currentPickNumber: number;
    settings: LiveDraftSettings;
    stateSnapshot: DraftStateSnapshot; // current draft context
}

export interface DraftTeam extends LeagueTeam {
    budget: number;
    remainingBudget: number;
    rosterSlots: RosterSlot[];
    filledPositions: Record<string, number>; // position -> count
}

export interface LiveDraftSettings {
    totalBudget: number;
    teamCount: number;
    rosterSettings: RosterSettings;
    estimationSettings: EstimationSettingsState;
    searchSettings: SearchSettingsState;
}

// Core context snapshot for any point in a draft
export interface DraftStateSnapshot {
    pickNumber: number;
    totalMoneySpent: number;
    moneySpentByPosition: Record<string, number>;
    playersPickedByPosition: Record<string, number>;
    budgetDistribution: BudgetDistribution;
    positionScarcityMetrics: Record<string, PositionScarcity>;
}

export interface BudgetDistribution {
    averageRemaining: number;
    medianRemaining: number;
    minRemaining: number;
    maxRemaining: number;
    teamsWithLowBudget: number; // count of teams with <10% budget left
}

export interface PositionScarcity {
    totalSlotsInLeague: number;
    slotsFilled: number;
    slotsRemaining: number;
    qualityPlayersRemaining: number; // top-tier options left
    scarcityRatio: number; // slotsRemaining / qualityPlayersRemaining
}

// Enhanced predictions for live draft
export interface LivePricePrediction extends CostEstimatedPlayer {
    baselineCost: number; // from exponential curve
    contextualAdjustment: number; // $ adjustment from current state
    livePrediction: number; // baselineCost + contextualAdjustment
    confidence: number; // 0-1, model confidence in adjustment
}

// Utility types for analysis and reporting
export interface SpendingTrends {
    positionSpending: Record<string, PositionSpending>;
    overallInflation: number;
    premiumPositionInflation: number;
    utilityPositionInflation: number;
}

export interface PositionSpending {
    position: string;
    averagePrice: number;
    predictedAverage: number;
    inflationRate: number;
    pickCount: number;
}

export interface RosterAnalysis {
    unfilledPositions: Record<string, PositionNeed>;
    budgetStatus: BudgetStatus;
    projectedSpending: Record<string, number>; // remaining positions -> projected cost
}

export interface PositionNeed {
    position: string;
    totalSlots: number;
    filledSlots: number;
    remainingSlots: number;
    teamsNeedingPosition: number;
}

export interface BudgetStatus {
    averageRemaining: number;
    highestRemaining: { teamId: string; amount: number };
    lowestRemaining: { teamId: string; amount: number };
    teamsInTrouble: number; // teams with very low budgets relative to roster needs
}