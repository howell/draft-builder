/**
 * Core budget conversion utilities for live draft model
 * 
 * Provides universal compatibility across different budget sizes by using
 * percentage-based calculations. All model operations work in percentages,
 * with conversion to/from absolute dollars only at UI boundaries.
 */

export interface BudgetConfig {
    totalBudgetPerTeam: number;
    teamCount: number;
}

/**
 * Core budget conversion utilities focused on percentage/dollar conversion
 */
export class BudgetConverter {
    private readonly totalLeagueBudget: number;
    private readonly budgetPerTeam: number;
    private readonly teamCount: number;

    constructor(config: BudgetConfig) {
        this.budgetPerTeam = config.totalBudgetPerTeam;
        this.teamCount = config.teamCount;
        this.totalLeagueBudget = this.teamCount * this.budgetPerTeam;
    }

    /**
     * Convert absolute dollar amount to percentage of total league budget
     */
    toLeagueBudgetPercentage(absoluteAmount: number): number {
        return absoluteAmount / this.totalLeagueBudget;
    }

    /**
     * Convert percentage of total league budget to absolute dollar amount
     */
    fromLeagueBudgetPercentage(percentage: number): number {
        return percentage * this.totalLeagueBudget;
    }

    /**
     * Convert team budget to percentage of single team budget
     */
    toTeamBudgetPercentage(teamBudget: number): number {
        return teamBudget / this.budgetPerTeam;
    }

    /**
     * Convert percentage to team budget amount
     */
    fromTeamBudgetPercentage(percentage: number): number {
        return percentage * this.budgetPerTeam;
    }

    /**
     * Get configuration values
     */
    getTotalLeagueBudget(): number {
        return this.totalLeagueBudget;
    }

    getBudgetPerTeam(): number {
        return this.budgetPerTeam;
    }

    getTeamCount(): number {
        return this.teamCount;
    }

    /**
     * Static utility for simple price/percentage conversions
     */
    static dollarsToPercentage(dollars: number, totalBudget: number): number {
        return dollars / totalBudget;
    }

    static percentageToDollars(percentage: number, totalBudget: number): number {
        return percentage * totalBudget;
    }
}

/**
 * Utility functions for common percentage-based calculations
 */
export class PercentageCalculations {
    /**
     * Calculate inflation rate between predicted and actual percentages
     */
    static calculateInflationRate(actualPct: number, predictedPct: number): number {
        if (predictedPct === 0) return 0;
        return (actualPct - predictedPct) / predictedPct;
    }

    /**
     * Calculate position scarcity as ratio of remaining slots to quality players
     */
    static calculatePositionScarcity(
        slotsRemaining: number,
        qualityPlayersRemaining: number
    ): number {
        if (qualityPlayersRemaining === 0) return Infinity;
        return slotsRemaining / qualityPlayersRemaining;
    }

    /**
     * Normalize percentage values to reasonable ranges for model training
     */
    static normalizePercentage(value: number, min: number = -5, max: number = 5): number {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Calculate budget pressure (overspending/underspending vs baseline)
     * Positive = overspending, Negative = underspending
     */
    static calculateBudgetPressure(
        actualSpentPct: number,
        baselineSpentPct: number
    ): number {
        if (baselineSpentPct <= 0) return 0;
        return (actualSpentPct - baselineSpentPct) / baselineSpentPct;
    }
}

/**
 * Utility functions for exponential baseline models
 */
export class ExponentialCalculations {
    /**
     * Calculate exponential decay value: a * exp(b * x)
     */
    static exponentialDecay(
        x: number,
        coefficients: [number, number],
        minValue: number = 0.001
    ): number {
        const [a, b] = coefficients;
        return Math.max(minValue, a * Math.exp(b * x));
    }

    /**
     * Calculate expected spending percentage using exponential model
     */
    static calculateExpectedSpending(
        progress: number,
        coefficients: [number, number]
    ): number {
        const [totalUtilization, decayRate] = coefficients;
        return totalUtilization * (1 - Math.exp(decayRate * progress));
    }
}