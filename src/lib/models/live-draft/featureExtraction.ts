/**
 * Data-driven feature extraction engine for live draft linear regression model
 * 
 * Extracts 8 domain-informed features from current draft state using 
 * existing exponential regression models from analytics.ts. Features 
 * naturally converge to baseline behavior in early draft states.
 */

import { BudgetConverter, PercentageCalculations } from "./budgetConversions";
import regression from 'regression';
import { predictPrice } from '@/app/league/analytics';

// Types for feature extraction (not dependent on storage types)
export interface DraftPick {
    player: {
        defaultPosition: string;
        positionRank: number;
        overallRank: number;
    };
    price: number;
    pickNumber: number;
}

export interface DraftContext {
    picks: DraftPick[];
    currentPickNumber: number;
    totalPicks: number;
    budgetConfig: {
        totalBudgetPerTeam: number;
        teamCount: number;
    };
}

export interface BaselineModels {
    // Overall exponential regression for all positions
    overall: regression.Result;
    // Position-specific exponential regressions
    positions: Record<string, regression.Result>;
}

// 8-feature vector for linear regression
export interface LiveDraftFeatures {
    // Player characteristics (3 features)
    playerPosition: string;
    playerPositionRank: number;
    playerOverallRank: number;
    
    // Scarcity metrics (2 features)
    positionScarcity: number;
    overallScarcity: number;
    
    // Draft context (3 features) 
    budgetSpentPct: number;
    budgetPressure: number;
    positionalPressure: number;
}

export class FeatureExtractor {
    private readonly budgetConverter: BudgetConverter;
    private readonly baselineModels: BaselineModels;

    constructor(
        budgetConfig: { totalBudgetPerTeam: number; teamCount: number },
        baselineModels: BaselineModels
    ) {
        this.budgetConverter = new BudgetConverter(budgetConfig);
        this.baselineModels = baselineModels;
    }

    /**
     * Extract all 8 features for a player at current draft state
     */
    extractFeatures(
        player: { defaultPosition: string; positionRank: number; overallRank: number },
        context: DraftContext
    ): LiveDraftFeatures {
        return {
            // Player characteristics (3 features)
            playerPosition: player.defaultPosition,
            playerPositionRank: player.positionRank,
            playerOverallRank: player.overallRank,
            
            // Scarcity metrics (2 features)
            positionScarcity: this.calculatePositionScarcity(player, context),
            overallScarcity: this.calculateOverallScarcity(player, context),
            
            // Draft context (3 features)
            budgetSpentPct: this.calculateBudgetSpentPercentage(context),
            budgetPressure: this.calculateBudgetPressure(context),
            positionalPressure: this.calculatePositionalPressure(player.defaultPosition, context)
        };
    }

    /**
     * Calculate position scarcity: number of higher-ranked players at position still available
     */
    private calculatePositionScarcity(
        player: { defaultPosition: string; positionRank: number },
        context: DraftContext
    ): number {
        return this.calculateScarcityMetric(
            context.picks,
            pick => pick.player.defaultPosition === player.defaultPosition && 
                   pick.player.positionRank < player.positionRank,
            player.positionRank
        );
    }

    /**
     * Calculate overall scarcity: higher-ranked players overall still available
     */
    private calculateOverallScarcity(
        player: { overallRank: number },
        context: DraftContext
    ): number {
        return this.calculateScarcityMetric(
            context.picks,
            pick => pick.player.overallRank < player.overallRank,
            player.overallRank
        );
    }

    /**
     * Generic scarcity calculation: drafted higher-ranked players / player rank
     */
    private calculateScarcityMetric(
        picks: DraftPick[],
        filterPredicate: (pick: DraftPick) => boolean,
        playerRank: number
    ): number {
        const higherRankedDrafted = picks.filter(filterPredicate).length;
        return Math.min(1.0, higherRankedDrafted / playerRank);
    }

    /**
     * Calculate current budget spent percentage
     */
    private calculateBudgetSpentPercentage(context: DraftContext): number {
        const totalSpent = context.picks.reduce((sum, pick) => sum + pick.price, 0);
        return this.budgetConverter.toLeagueBudgetPercentage(totalSpent);
    }

    /**
     * Calculate overall budget pressure vs baseline exponential model
     */
    private calculateBudgetPressure(context: DraftContext): number {
        const actualSpentPct = this.calculateBudgetSpentPercentage(context);
        
        // Calculate expected total spending by summing predicted prices for all picks made
        const totalExpectedDollars = context.picks.reduce((sum, pick) => {
            return sum + predictPrice(this.baselineModels.overall, pick.pickNumber);
        }, 0);
        
        const expectedSpentPct = this.budgetConverter.toLeagueBudgetPercentage(totalExpectedDollars);
        
        return PercentageCalculations.calculateBudgetPressure(actualSpentPct, expectedSpentPct);
    }

    /**
     * Calculate positional budget pressure vs baseline model
     */
    private calculatePositionalPressure(position: string, context: DraftContext): number {
        // Calculate actual spending for this position
        const positionPicks = context.picks.filter(pick => pick.player.defaultPosition === position);
        const actualPositionSpent = positionPicks.reduce((sum, pick) => sum + pick.price, 0);
        const actualPositionSpentPct = this.budgetConverter.toLeagueBudgetPercentage(actualPositionSpent);
        
        // Calculate expected spending using position-specific regression if available
        const positionModel = this.baselineModels.positions[position] || this.baselineModels.overall;
        const expectedPositionSpent = positionPicks.reduce((sum, pick) => {
            return sum + predictPrice(positionModel, pick.pickNumber);
        }, 0);
        
        const expectedPositionSpentPct = this.budgetConverter.toLeagueBudgetPercentage(expectedPositionSpent);
        
        return PercentageCalculations.calculateBudgetPressure(
            actualPositionSpentPct, 
            expectedPositionSpentPct
        );
    }

    /**
     * Discover positions from actual draft data
     */
    static discoverPositions(picks: DraftPick[]): string[] {
        const positions = new Set<string>();
        picks.forEach(pick => positions.add(pick.player.defaultPosition));
        return Array.from(positions).sort();
    }

    /**
     * Validate extracted features
     */
    static validateFeatures(features: LiveDraftFeatures): boolean {
        // Ranks should be positive
        if (features.playerPositionRank <= 0 || features.playerOverallRank <= 0) return false;
        
        // Scarcity should be 0-1
        if (features.positionScarcity < 0 || features.positionScarcity > 1) return false;
        if (features.overallScarcity < 0 || features.overallScarcity > 1) return false;
        
        // Budget spent should be 0-1
        if (features.budgetSpentPct < 0 || features.budgetSpentPct > 1) return false;
        
        // Pressure metrics should be reasonable (-5 to +5)
        if (Math.abs(features.budgetPressure) > 5) return false;
        if (Math.abs(features.positionalPressure) > 5) return false;
        
        return true;
    }

    /**
     * Convert features to numeric vector for linear regression
     */
    static featuresToVector(features: LiveDraftFeatures, allPositions: string[]): number[] {
        // One-hot encode position (categorical variable)
        const positionEncoding = allPositions.map(pos => 
            pos === features.playerPosition ? 1 : 0
        );
        
        // Continuous features
        const continuousFeatures = [
            features.playerPositionRank,
            features.playerOverallRank,
            features.positionScarcity,
            features.overallScarcity,
            features.budgetSpentPct,
            features.budgetPressure,
            features.positionalPressure
        ];
        
        return [...positionEncoding, ...continuousFeatures];
    }
}