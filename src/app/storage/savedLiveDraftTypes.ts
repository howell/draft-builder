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

// Core context snapshot for any point in a draft - percentage-based (canonical)
export interface DraftStateSnapshot {
    pickNumber: number;
    totalBudgetSpentPct: number; // % of total league budget spent
    budgetSpentByPositionPct: Record<string, number>; // % of total budget spent per position
    playersPickedByPosition: Record<string, number>;
    budgetDistribution: BudgetDistribution;
    positionScarcityMetrics: Record<string, PositionScarcity>;
}

export interface BudgetDistribution {
    averageRemainingPct: number; // % of original budget remaining
    medianRemainingPct: number;
    minRemainingPct: number;
    maxRemainingPct: number;
    teamsWithLowBudgetPct: number; // % of teams with <10% budget left
}

export interface PositionScarcity {
    totalSlotsInLeague: number;
    slotsFilled: number;
    slotsRemaining: number;
    qualityPlayersRemaining: number; // top-tier options left
    scarcityRatio: number; // slotsRemaining / qualityPlayersRemaining
}

// Enhanced predictions for live draft - percentage-based (canonical)
export interface LivePricePrediction extends CostEstimatedPlayer {
    baselineCostPct: number; // % of total budget from exponential curve
    contextualAdjustmentPct: number; // % adjustment from current state
    livePredictionPct: number; // baselineCostPct + contextualAdjustmentPct
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
    averagePricePct: number; // % of total budget
    predictedAveragePct: number; // % of total budget
    inflationRate: number; // same regardless of budget size
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

// Historical data for linear regression model training
export interface HistoricalDraftContext {
    leagueId: LeagueId;
    seasonId: SeasonId;
    picks: HistoricalPick[];
    draftSettings: LiveDraftSettings;
}

export interface HistoricalPick extends LiveDraftPick {
    features: LiveDraftFeatures; // 8 features extracted at time of pick
    actualPricePct: number; // actual price as % of total budget
    baselinePredictionPct: number; // what exponential model predicted as %
}

// 8 features for linear regression model
export interface LiveDraftFeatures {
    // Player characteristics (3 features)
    playerPosition: string; // QB, RB, WR, TE, K, DEF
    playerPositionRank: number; // 1st QB, 2nd QB, etc.
    playerOverallRank: number; // 1-300 consensus ranking
    
    // Scarcity metrics (2 features)
    positionScarcity: number; // higher-ranked players at position still available
    overallScarcity: number; // higher-ranked players overall still available
    
    // Draft context (3 features) 
    budgetSpentPct: number; // % of total league budget spent so far
    budgetPressure: number; // league-wide over/under spending vs baseline
    positionalPressure: number; // position-specific over/under spending vs baseline
}

// Linear regression model (trained on-demand, not stored)
export interface LiveDraftLinearModel {
    coefficients: LinearModelCoefficients;
    statistics: ModelStatistics;
}

export interface LinearModelCoefficients {
    intercept: number;
    // Position dummy variables (QB is baseline)
    position: Record<string, number>; // RB: 0.05, WR: 0.03, etc.
    positionRank: number;
    overallRank: number;
    positionScarcity: number;
    overallScarcity: number;
    budgetSpent: number;
    budgetPressure: number;
    positionalPressure: number;
}

export interface ModelStatistics {
    r2: number; // model fit quality
    adjustedR2: number; // adjusted for number of features
    sampleSize: number;
    // Validation metrics
    baselineConvergenceR2: number; // how well early picks match baseline
}

// Enhanced predictions with linear model features
export interface LivePricePredictionWithModel extends LivePricePrediction {
    features: LiveDraftFeatures; // features used for this prediction
    predictionComponents: PredictionComponents; // breakdown of what drove prediction
}

export interface PredictionComponents {
    baseComponent: number; // intercept + position + ranks (≈ baseline)
    scarcityComponent: number; // scarcity coefficients × scarcity features
    contextComponent: number; // budget pressure coefficients × context features
    totalPrediction: number; // sum of all components
}