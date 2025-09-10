/**
 * Unit tests for budget conversion utilities
 */

import { 
    BudgetConverter, 
    PercentageCalculations, 
    ExponentialCalculations 
} from '../budgetConversions';

describe('BudgetConverter', () => {
    const budgetConfig = {
        totalBudgetPerTeam: 200,
        teamCount: 12
    };
    
    let converter: BudgetConverter;

    beforeEach(() => {
        converter = new BudgetConverter(budgetConfig);
    });

    describe('Basic conversions', () => {
        it('should convert dollar amounts to league budget percentage', () => {
            const totalLeagueBudget = 200 * 12; // $2400
            
            expect(converter.toLeagueBudgetPercentage(240)).toBeCloseTo(0.1); // 10%
            expect(converter.toLeagueBudgetPercentage(1200)).toBeCloseTo(0.5); // 50%
            expect(converter.toLeagueBudgetPercentage(2400)).toBeCloseTo(1.0); // 100%
        });

        it('should convert percentage back to dollars', () => {
            expect(converter.fromLeagueBudgetPercentage(0.1)).toBeCloseTo(240);
            expect(converter.fromLeagueBudgetPercentage(0.5)).toBeCloseTo(1200);
            expect(converter.fromLeagueBudgetPercentage(1.0)).toBeCloseTo(2400);
        });

        it('should handle team budget conversions', () => {
            expect(converter.toTeamBudgetPercentage(20)).toBeCloseTo(0.1); // 10% of team budget
            expect(converter.toTeamBudgetPercentage(100)).toBeCloseTo(0.5); // 50% of team budget
            expect(converter.toTeamBudgetPercentage(200)).toBeCloseTo(1.0); // 100% of team budget
        });

        it('should convert team budget percentage back to dollars', () => {
            expect(converter.fromTeamBudgetPercentage(0.1)).toBeCloseTo(20);
            expect(converter.fromTeamBudgetPercentage(0.5)).toBeCloseTo(100);
            expect(converter.fromTeamBudgetPercentage(1.0)).toBeCloseTo(200);
        });
    });

    describe('Configuration getters', () => {
        it('should return correct total league budget', () => {
            expect(converter.getTotalLeagueBudget()).toBe(2400);
        });

        it('should return correct budget per team', () => {
            expect(converter.getBudgetPerTeam()).toBe(200);
        });

        it('should return correct team count', () => {
            expect(converter.getTeamCount()).toBe(12);
        });
    });

    describe('Static utility methods', () => {
        it('should convert dollars to percentage statically', () => {
            expect(BudgetConverter.dollarsToPercentage(50, 200)).toBeCloseTo(0.25);
            expect(BudgetConverter.dollarsToPercentage(100, 200)).toBeCloseTo(0.5);
        });

        it('should convert percentage to dollars statically', () => {
            expect(BudgetConverter.percentageToDollars(0.25, 200)).toBeCloseTo(50);
            expect(BudgetConverter.percentageToDollars(0.5, 200)).toBeCloseTo(100);
        });
    });

    describe('Edge cases', () => {
        it('should handle zero values', () => {
            expect(converter.toLeagueBudgetPercentage(0)).toBe(0);
            expect(converter.fromLeagueBudgetPercentage(0)).toBe(0);
        });

        it('should handle very small values', () => {
            const smallValue = converter.toLeagueBudgetPercentage(1);
            expect(smallValue).toBeGreaterThan(0);
            expect(converter.fromLeagueBudgetPercentage(smallValue)).toBeCloseTo(1, 1);
        });

        it('should handle large values', () => {
            const largeAmount = 10000;
            const percentage = converter.toLeagueBudgetPercentage(largeAmount);
            expect(converter.fromLeagueBudgetPercentage(percentage)).toBeCloseTo(largeAmount);
        });
    });
});

describe('PercentageCalculations', () => {
    describe('calculateInflationRate', () => {
        it('should calculate positive inflation correctly', () => {
            expect(PercentageCalculations.calculateInflationRate(1.1, 1.0)).toBeCloseTo(0.1); // 10% inflation
            expect(PercentageCalculations.calculateInflationRate(1.5, 1.0)).toBeCloseTo(0.5); // 50% inflation
        });

        it('should calculate deflation correctly', () => {
            expect(PercentageCalculations.calculateInflationRate(0.9, 1.0)).toBeCloseTo(-0.1); // 10% deflation
            expect(PercentageCalculations.calculateInflationRate(0.5, 1.0)).toBeCloseTo(-0.5); // 50% deflation
        });

        it('should handle zero predicted value', () => {
            expect(PercentageCalculations.calculateInflationRate(1.0, 0)).toBe(0);
        });

        it('should handle equal values', () => {
            expect(PercentageCalculations.calculateInflationRate(1.0, 1.0)).toBeCloseTo(0);
        });
    });

    describe('calculatePositionScarcity', () => {
        it('should calculate scarcity correctly', () => {
            expect(PercentageCalculations.calculatePositionScarcity(10, 20)).toBeCloseTo(0.5);
            expect(PercentageCalculations.calculatePositionScarcity(5, 10)).toBeCloseTo(0.5);
            expect(PercentageCalculations.calculatePositionScarcity(1, 10)).toBeCloseTo(0.1);
        });

        it('should handle zero quality players', () => {
            expect(PercentageCalculations.calculatePositionScarcity(10, 0)).toBe(Infinity);
        });

        it('should handle equal slots and players', () => {
            expect(PercentageCalculations.calculatePositionScarcity(10, 10)).toBeCloseTo(1.0);
        });
    });

    describe('normalizePercentage', () => {
        it('should normalize values within default range', () => {
            expect(PercentageCalculations.normalizePercentage(3)).toBe(3);
            expect(PercentageCalculations.normalizePercentage(-3)).toBe(-3);
        });

        it('should clamp values outside default range', () => {
            expect(PercentageCalculations.normalizePercentage(10)).toBe(5); // max = 5
            expect(PercentageCalculations.normalizePercentage(-10)).toBe(-5); // min = -5
        });

        it('should use custom min/max', () => {
            expect(PercentageCalculations.normalizePercentage(10, -2, 2)).toBe(2);
            expect(PercentageCalculations.normalizePercentage(-10, -2, 2)).toBe(-2);
        });
    });

    describe('calculateBudgetPressure', () => {
        it('should calculate overspending pressure', () => {
            expect(PercentageCalculations.calculateBudgetPressure(1.1, 1.0)).toBeCloseTo(0.1); // 10% overspending
            expect(PercentageCalculations.calculateBudgetPressure(1.5, 1.0)).toBeCloseTo(0.5); // 50% overspending
        });

        it('should calculate underspending pressure', () => {
            expect(PercentageCalculations.calculateBudgetPressure(0.9, 1.0)).toBeCloseTo(-0.1); // 10% underspending
            expect(PercentageCalculations.calculateBudgetPressure(0.5, 1.0)).toBeCloseTo(-0.5); // 50% underspending
        });

        it('should handle zero baseline', () => {
            expect(PercentageCalculations.calculateBudgetPressure(1.0, 0)).toBe(0);
        });

        it('should handle negative baseline', () => {
            expect(PercentageCalculations.calculateBudgetPressure(1.0, -1.0)).toBe(0);
        });
    });
});

describe('ExponentialCalculations', () => {
    describe('exponentialDecay', () => {
        it('should calculate exponential decay correctly', () => {
            const result = ExponentialCalculations.exponentialDecay(1, [2, -0.5]);
            expect(result).toBeCloseTo(2 * Math.exp(-0.5));
        });

        it('should enforce minimum value', () => {
            const result = ExponentialCalculations.exponentialDecay(10, [1, -2], 0.1);
            expect(result).toBeGreaterThanOrEqual(0.1);
        });

        it('should handle zero input', () => {
            const result = ExponentialCalculations.exponentialDecay(0, [2, -0.5]);
            expect(result).toBeCloseTo(2);
        });
    });

    describe('calculateExpectedSpending', () => {
        it('should calculate expected spending correctly', () => {
            // With progress = 0, should return 0
            expect(ExponentialCalculations.calculateExpectedSpending(0, [0.8, -1.2])).toBeCloseTo(0);
            
            // With progress = 1, should approach total utilization
            const result = ExponentialCalculations.calculateExpectedSpending(1, [0.8, -1.2]);
            expect(result).toBeCloseTo(0.8 * (1 - Math.exp(-1.2)));
        });

        it('should handle intermediate progress values', () => {
            const result = ExponentialCalculations.calculateExpectedSpending(0.5, [0.8, -1.2]);
            expect(result).toBeGreaterThan(0);
            expect(result).toBeLessThan(0.8);
        });
    });
});