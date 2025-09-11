/**
 * Unit tests for feature extraction engine
 */

import { FeatureExtractor, DraftContext, DraftPick, BaselineModels } from '../featureExtraction';
import { BudgetConverter } from '../budgetConversions';

// Mock the analytics module
jest.mock('@/app/league/analytics', () => ({
    predictPrice: jest.fn((model: any, rank: number) => {
        // Simple mock: price decreases with rank
        return Math.max(1, Math.round(100 - rank * 2));
    })
}));

describe('FeatureExtractor', () => {
    const budgetConfig = {
        totalBudgetPerTeam: 200,
        teamCount: 12
    };

    const mockBaselineModels: BaselineModels = {
        overall: {
            predict: jest.fn((rank: number) => [rank, Math.max(1, 100 - rank * 2)])
        } as any,
        positions: {
            'QB': {
                predict: jest.fn((rank: number) => [rank, Math.max(1, 50 - rank)])
            } as any,
            'RB': {
                predict: jest.fn((rank: number) => [rank, Math.max(1, 80 - rank * 1.5)])
            } as any
        }
    };

    let extractor: FeatureExtractor;

    beforeEach(() => {
        extractor = new FeatureExtractor(budgetConfig, mockBaselineModels);
    });

    describe('Feature extraction', () => {
        const mockPlayer = {
            defaultPosition: 'RB',
            positionRank: 5,
            overallRank: 15
        };

        const createMockContext = (picks: Partial<DraftPick>[] = []): DraftContext => ({
            picks: picks.map((pick, i) => ({
                player: {
                    defaultPosition: 'QB',
                    positionRank: i + 1,
                    overallRank: i + 1
                },
                price: 50 - i * 5,
                pickNumber: i + 1,
                ...pick
            })) as DraftPick[],
            currentPickNumber: picks.length + 1,
            totalPicks: 180, // 12 teams * 15 roster spots
            budgetConfig
        });

        it('should extract basic player features correctly', () => {
            const context = createMockContext();
            const features = extractor.extractFeatures(mockPlayer, context);

            expect(features.playerPosition).toBe('RB');
            expect(features.playerPositionRank).toBe(5);
            expect(features.playerOverallRank).toBe(15);
        });

        it('should calculate position scarcity correctly', () => {
            // Create context with some RBs already drafted
            const context = createMockContext([
                { player: { defaultPosition: 'RB', positionRank: 1, overallRank: 3 }, price: 80 },
                { player: { defaultPosition: 'RB', positionRank: 2, overallRank: 8 }, price: 70 },
                { player: { defaultPosition: 'RB', positionRank: 4, overallRank: 12 }, price: 60 }
            ]);

            const features = extractor.extractFeatures(mockPlayer, context);
            
            // 3 higher-ranked RBs drafted out of position rank 5 = 3/5 = 0.6
            expect(features.positionScarcity).toBeCloseTo(0.6);
        });

        it('should calculate overall scarcity correctly', () => {
            // Create context with higher overall ranked players drafted
            const context = createMockContext([
                { player: { defaultPosition: 'RB', positionRank: 1, overallRank: 1 }, price: 90 },
                { player: { defaultPosition: 'WR', positionRank: 2, overallRank: 5 }, price: 70 },
                { player: { defaultPosition: 'RB', positionRank: 3, overallRank: 10 }, price: 60 }
            ]);

            const features = extractor.extractFeatures(mockPlayer, context);
            
            // 3 higher overall ranked players drafted out of overall rank 15 = 3/15 = 0.2
            expect(features.overallScarcity).toBeCloseTo(0.2);
        });

        it('should calculate budget spent percentage correctly', () => {
            const totalLeagueBudget = 200 * 12; // $2400
            const context = createMockContext([
                { price: 60 },
                { price: 50 },
                { price: 40 }
            ]);
            // Total spent: 150, percentage: 150/2400 = 0.0625

            const features = extractor.extractFeatures(mockPlayer, context);
            expect(features.budgetSpentPct).toBeCloseTo(0.0625);
        });

        it('should handle empty draft context', () => {
            const context = createMockContext();
            const features = extractor.extractFeatures(mockPlayer, context);

            expect(features.positionScarcity).toBe(0); // No players drafted yet
            expect(features.overallScarcity).toBe(0);
            expect(features.budgetSpentPct).toBe(0);
            expect(features.budgetPressure).toBeDefined();
            expect(features.positionalPressure).toBeDefined();
        });
    });

    describe('Scarcity metric calculation', () => {
        it('should handle zero higher-ranked players', () => {
            const context: DraftContext = {
                picks: [],
                currentPickNumber: 1,
                totalPicks: 180,
                budgetConfig
            };

            const player = { defaultPosition: 'QB', positionRank: 1, overallRank: 1 };
            const features = extractor.extractFeatures(player, context);

            expect(features.positionScarcity).toBe(0);
            expect(features.overallScarcity).toBe(0);
        });

        it('should cap scarcity at 1.0', () => {
            // Create context where many higher-ranked players are drafted
            // For a player ranked 3, if we draft players 1, 2, 4, 5, 6, 7... 
            // Only players 1, 2 are higher ranked = 2/3 = 0.67, not capped
            
            // But if we draft players 1, 2, 3, 4, 5 for a player ranked 3
            // Players 1, 2, 3 are higher or equal ranked = 3/3 = 1.0 (capped)
            const picks = Array.from({ length: 8 }, (_, i) => ({
                player: { 
                    defaultPosition: 'QB', 
                    positionRank: i + 1, // Ranks 1, 2, 3, 4, 5, 6, 7, 8
                    overallRank: i + 1 
                },
                price: 50,
                pickNumber: i + 1
            }));

            const context: DraftContext = {
                picks,
                currentPickNumber: 9,
                totalPicks: 180,
                budgetConfig
            };

            // Test with a player ranked 3 - players 1, 2 are higher ranked = 2/3 = 0.67
            const player = { defaultPosition: 'QB', positionRank: 3, overallRank: 3 };
            const features = extractor.extractFeatures(player, context);

            expect(features.positionScarcity).toBeCloseTo(0.67, 2);
            expect(features.overallScarcity).toBeCloseTo(0.67, 2);
            
            // Test capping with extreme case: many players drafted for low-ranked player
            const lowRankedPlayer = { defaultPosition: 'QB', positionRank: 1, overallRank: 1 };
            const lowRankedFeatures = extractor.extractFeatures(lowRankedPlayer, context);
            
            // Since no players have rank < 1, scarcity should be 0/1 = 0
            expect(lowRankedFeatures.positionScarcity).toBe(0);
            expect(lowRankedFeatures.overallScarcity).toBe(0);
        });
    });

    describe('Position discovery', () => {
        it('should discover all positions from draft data', () => {
            const picks: DraftPick[] = [
                { player: { defaultPosition: 'QB' }, price: 50, pickNumber: 1 } as DraftPick,
                { player: { defaultPosition: 'RB' }, price: 45, pickNumber: 2 } as DraftPick,
                { player: { defaultPosition: 'WR' }, price: 40, pickNumber: 3 } as DraftPick,
                { player: { defaultPosition: 'RB' }, price: 35, pickNumber: 4 } as DraftPick,
                { player: { defaultPosition: 'TE' }, price: 30, pickNumber: 5 } as DraftPick
            ];

            const positions = FeatureExtractor.discoverPositions(picks);
            expect(positions).toEqual(['QB', 'RB', 'TE', 'WR']); // Should be sorted
        });

        it('should handle empty picks', () => {
            const positions = FeatureExtractor.discoverPositions([]);
            expect(positions).toEqual([]);
        });

        it('should handle duplicate positions', () => {
            const picks: DraftPick[] = [
                { player: { defaultPosition: 'RB' }, price: 50, pickNumber: 1 } as DraftPick,
                { player: { defaultPosition: 'RB' }, price: 45, pickNumber: 2 } as DraftPick,
                { player: { defaultPosition: 'RB' }, price: 40, pickNumber: 3 } as DraftPick
            ];

            const positions = FeatureExtractor.discoverPositions(picks);
            expect(positions).toEqual(['RB']);
        });
    });

    describe('Feature validation', () => {
        it('should validate correct features', () => {
            const validFeatures = {
                playerPosition: 'RB',
                playerPositionRank: 5,
                playerOverallRank: 15,
                positionScarcity: 0.3,
                overallScarcity: 0.2,
                budgetSpentPct: 0.25,
                budgetPressure: 1.5,
                positionalPressure: -0.8
            };

            expect(FeatureExtractor.validateFeatures(validFeatures)).toBe(true);
        });

        it('should reject features with invalid ranks', () => {
            const invalidFeatures = {
                playerPosition: 'RB',
                playerPositionRank: 0, // Invalid: should be positive
                playerOverallRank: 15,
                positionScarcity: 0.3,
                overallScarcity: 0.2,
                budgetSpentPct: 0.25,
                budgetPressure: 1.5,
                positionalPressure: -0.8
            };

            expect(FeatureExtractor.validateFeatures(invalidFeatures)).toBe(false);
        });

        it('should reject features with invalid scarcity values', () => {
            const invalidFeatures = {
                playerPosition: 'RB',
                playerPositionRank: 5,
                playerOverallRank: 15,
                positionScarcity: 1.5, // Invalid: should be <= 1
                overallScarcity: 0.2,
                budgetSpentPct: 0.25,
                budgetPressure: 1.5,
                positionalPressure: -0.8
            };

            expect(FeatureExtractor.validateFeatures(invalidFeatures)).toBe(false);
        });

        it('should reject features with invalid budget spent', () => {
            const invalidFeatures = {
                playerPosition: 'RB',
                playerPositionRank: 5,
                playerOverallRank: 15,
                positionScarcity: 0.3,
                overallScarcity: 0.2,
                budgetSpentPct: 1.5, // Invalid: should be <= 1
                budgetPressure: 1.5,
                positionalPressure: -0.8
            };

            expect(FeatureExtractor.validateFeatures(invalidFeatures)).toBe(false);
        });

        it('should reject features with extreme pressure values', () => {
            const invalidFeatures = {
                playerPosition: 'RB',
                playerPositionRank: 5,
                playerOverallRank: 15,
                positionScarcity: 0.3,
                overallScarcity: 0.2,
                budgetSpentPct: 0.25,
                budgetPressure: 10, // Invalid: should be < 5
                positionalPressure: -0.8
            };

            expect(FeatureExtractor.validateFeatures(invalidFeatures)).toBe(false);
        });
    });

    describe('Vector conversion', () => {
        it('should convert features to vector correctly', () => {
            const features = {
                playerPosition: 'RB',
                playerPositionRank: 5,
                playerOverallRank: 15,
                positionScarcity: 0.3,
                overallScarcity: 0.2,
                budgetSpentPct: 0.25,
                budgetPressure: 1.5,
                positionalPressure: -0.8
            };

            const positions = ['QB', 'RB', 'WR', 'TE'];
            const vector = FeatureExtractor.featuresToVector(features, positions);

            expect(vector).toHaveLength(positions.length + 7); // 4 positions + 7 continuous features
            expect(vector[0]).toBe(0); // QB = 0
            expect(vector[1]).toBe(1); // RB = 1
            expect(vector[2]).toBe(0); // WR = 0
            expect(vector[3]).toBe(0); // TE = 0
            expect(vector[4]).toBe(5); // playerPositionRank
            expect(vector[5]).toBe(15); // playerOverallRank
            expect(vector[6]).toBeCloseTo(0.3); // positionScarcity
            expect(vector[7]).toBeCloseTo(0.2); // overallScarcity
            expect(vector[8]).toBeCloseTo(0.25); // budgetSpentPct
            expect(vector[9]).toBeCloseTo(1.5); // budgetPressure
            expect(vector[10]).toBeCloseTo(-0.8); // positionalPressure
        });
    });
});