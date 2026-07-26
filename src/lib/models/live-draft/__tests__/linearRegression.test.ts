/**
 * Unit tests for linear regression trainer
 */

import { LinearRegressionTrainer, TrainingDataPoint } from '../linearRegression';
import { LiveDraftFeatures } from '../featureExtraction';

describe('LinearRegressionTrainer', () => {
    const positions = ['QB', 'RB', 'WR', 'TE'];
    let trainer: LinearRegressionTrainer;

    beforeEach(() => {
        trainer = new LinearRegressionTrainer(positions);
    });

    describe('Training data validation', () => {
        it('should reject insufficient training data', () => {
            const insufficientData: TrainingDataPoint[] = [
                {
                    features: createMockFeatures('QB', 1, 5),
                    actualPricePct: 0.05
                }
            ];

            expect(() => trainer.train(insufficientData)).toThrow('Insufficient training data');
        });

        it('should accept sufficient training data', () => {
            const sufficientData = createMockTrainingData(20);
            
            expect(() => trainer.train(sufficientData)).not.toThrow();
        });
    });

    describe('Feature to vector conversion', () => {
        it('should convert features to vector with one-hot position encoding', () => {
            const features: LiveDraftFeatures = {
                playerPosition: 'RB',
                playerPositionRank: 5,
                playerOverallRank: 15,
                positionScarcity: 0.3,
                overallScarcity: 0.2,
                budgetSpentPct: 0.25,
                budgetPressure: 1.5,
                positionalPressure: -0.8
            };

            // Access private method via prototype
            const vector = (trainer as any).featuresToVector(features);

            // Should exclude first position (QB) to avoid multicollinearity
            // So we expect: [RB=1, WR=0, TE=0, ...continuous features]
            expect(vector).toHaveLength(10); // 3 positions (excluding QB) + 7 continuous
            expect(vector[0]).toBe(1); // RB = 1
            expect(vector[1]).toBe(0); // WR = 0
            expect(vector[2]).toBe(0); // TE = 0
            expect(vector[3]).toBe(5); // playerPositionRank
            expect(vector[4]).toBe(15); // playerOverallRank
            expect(vector[5]).toBeCloseTo(0.3); // positionScarcity
            expect(vector[6]).toBeCloseTo(0.2); // overallScarcity
            expect(vector[7]).toBeCloseTo(0.25); // budgetSpentPct
            expect(vector[8]).toBeCloseTo(1.5); // budgetPressure
            expect(vector[9]).toBeCloseTo(-0.8); // positionalPressure
        });

        it('should handle reference category (first position)', () => {
            const features: LiveDraftFeatures = {
                playerPosition: 'QB', // First position (reference category)
                playerPositionRank: 2,
                playerOverallRank: 8,
                positionScarcity: 0.1,
                overallScarcity: 0.1,
                budgetSpentPct: 0.15,
                budgetPressure: 0.5,
                positionalPressure: 0.2
            };

            const vector = (trainer as any).featuresToVector(features);

            // All position indicators should be 0 for reference category
            expect(vector[0]).toBe(0); // RB = 0
            expect(vector[1]).toBe(0); // WR = 0
            expect(vector[2]).toBe(0); // TE = 0
        });
    });

    describe('Model training and prediction', () => {
        it('should train model and make predictions', () => {
            const trainingData = createMockTrainingData(30);
            const model = trainer.train(trainingData);

            expect(model).toBeDefined();
            expect(model.regression).toBeDefined();
            expect(model.coefficients).toBeDefined();
            expect(model.statistics).toBeDefined();
            expect(model.positions).toEqual(positions);
        });

        it('should structure coefficients correctly', () => {
            const trainingData = createMockTrainingData(25);
            const model = trainer.train(trainingData);

            // Check coefficient structure
            expect(model.coefficients.intercept).toBeDefined();
            expect(model.coefficients.positions).toBeDefined();
            expect(model.coefficients.positions['QB']).toBe(0); // Reference category
            expect(model.coefficients.positions['RB']).toBeDefined();
            expect(model.coefficients.positions['WR']).toBeDefined();
            expect(model.coefficients.positions['TE']).toBeDefined();
            
            // Check continuous feature coefficients
            expect(typeof model.coefficients.playerPositionRank).toBe('number');
            expect(typeof model.coefficients.playerOverallRank).toBe('number');
            expect(typeof model.coefficients.positionScarcity).toBe('number');
            expect(typeof model.coefficients.overallScarcity).toBe('number');
            expect(typeof model.coefficients.budgetSpentPct).toBe('number');
            expect(typeof model.coefficients.budgetPressure).toBe('number');
            expect(typeof model.coefficients.positionalPressure).toBe('number');
        });

        it('should calculate model statistics', () => {
            const trainingData = createMockTrainingData(40);
            const model = trainer.train(trainingData);

            expect(model.statistics.r2).toBeGreaterThanOrEqual(0);
            expect(model.statistics.r2).toBeLessThanOrEqual(1);
            expect(model.statistics.adjustedR2).toBeDefined();
            expect(model.statistics.sampleSize).toBe(40);
            expect(model.statistics.standardError).toBeGreaterThanOrEqual(0);
            expect(model.statistics.meanAbsoluteError).toBeGreaterThanOrEqual(0);
        });

        it('should make predictions with trained model', () => {
            const trainingData = createMockTrainingData(25);
            const model = trainer.train(trainingData);

            const testFeatures = createMockFeatures('RB', 3, 12);
            const prediction = trainer.makePrediction(testFeatures, model);

            expect(prediction.prediction).toBeDefined();
            expect(typeof prediction.prediction).toBe('number');
            expect(prediction.confidence).toBeGreaterThanOrEqual(0);
            expect(prediction.confidence).toBeLessThanOrEqual(1);
            expect(prediction.components).toBeDefined();
        });

        it('should calculate prediction components', () => {
            const trainingData = createMockTrainingData(25);
            const model = trainer.train(trainingData);

            const testFeatures = createMockFeatures('WR', 8, 25);
            const prediction = trainer.makePrediction(testFeatures, model);

            expect(prediction.components.intercept).toBeDefined();
            expect(prediction.components.positionComponent).toBeDefined();
            expect(prediction.components.playerCharacteristicsComponent).toBeDefined();
            expect(prediction.components.scarcityComponent).toBeDefined();
            expect(prediction.components.contextComponent).toBeDefined();
        });
    });

    describe('Static validation methods', () => {
        it('should validate correct features', () => {
            const validFeatures = createMockFeatures('RB', 5, 15);
            expect(LinearRegressionTrainer.validateFeatures(validFeatures)).toBe(true);
        });

        it('should reject invalid features', () => {
            const invalidFeatures = createMockFeatures('RB', -1, 15); // Invalid negative rank (ranks are 0-indexed)
            expect(LinearRegressionTrainer.validateFeatures(invalidFeatures)).toBe(false);
        });

        it('should calculate minimum sample size correctly', () => {
            expect(LinearRegressionTrainer.getMinimumSampleSize(4)).toBe(30); // (4-1) + 7 = 10 features * 3 = 30
            expect(LinearRegressionTrainer.getMinimumSampleSize(6)).toBe(36); // (6-1) + 7 = 12 features * 3 = 36
            expect(LinearRegressionTrainer.getMinimumSampleSize(1)).toBe(24); // 1 + 7 = 8 features * 3 = 24 (minimum 20)
        });
    });

    describe('Edge cases', () => {
        it('should handle single position training data', () => {
            const singlePositionTrainer = new LinearRegressionTrainer(['QB']);
            const trainingData = Array.from({ length: 15 }, (_, i) => ({
                features: createMockFeatures('QB', i + 1, i + 5),
                actualPricePct: 0.05 - i * 0.002
            }));

            expect(() => singlePositionTrainer.train(trainingData)).not.toThrow();
        });

        it('should handle extreme feature values', () => {
            const trainingData = createMockTrainingData(20);
            // Add some extreme values
            trainingData.push({
                features: {
                    playerPosition: 'RB',
                    playerPositionRank: 1,
                    playerOverallRank: 1,
                    positionScarcity: 1.0,
                    overallScarcity: 1.0,
                    budgetSpentPct: 1.0,
                    budgetPressure: 5.0,
                    positionalPressure: -5.0
                },
                actualPricePct: 0.1
            });

            expect(() => trainer.train(trainingData)).not.toThrow();
        });

        it('should handle identical feature values', () => {
            const identicalFeatures = createMockFeatures('QB', 5, 15);
            const trainingData = Array.from({ length: 20 }, () => ({
                features: identicalFeatures,
                actualPricePct: 0.05
            }));

            // This might fail due to singular matrix, but shouldn't crash
            expect(() => trainer.train(trainingData)).not.toThrow();
        });
    });
});

// Helper functions
function createMockFeatures(
    position: string = 'RB',
    positionRank: number = 5,
    overallRank: number = 15
): LiveDraftFeatures {
    return {
        playerPosition: position,
        playerPositionRank: positionRank,
        playerOverallRank: overallRank,
        positionScarcity: Math.random() * 0.5,
        overallScarcity: Math.random() * 0.5,
        budgetSpentPct: Math.random() * 0.8,
        budgetPressure: (Math.random() - 0.5) * 4, // -2 to 2
        positionalPressure: (Math.random() - 0.5) * 4 // -2 to 2
    };
}

function createMockTrainingData(size: number): TrainingDataPoint[] {
    const positions = ['QB', 'RB', 'WR', 'TE'];
    const data: TrainingDataPoint[] = [];

    for (let i = 0; i < size; i++) {
        const position = positions[i % positions.length];
        const positionRank = Math.floor(i / positions.length) + 1;
        const overallRank = i + 1;

        // Create realistic price relationship: higher rank (lower number) = higher price
        const basePrice = 0.08 - (overallRank * 0.001);
        const noise = (Math.random() - 0.5) * 0.01;
        const actualPricePct = Math.max(0.001, basePrice + noise);

        data.push({
            features: createMockFeatures(position, positionRank, overallRank),
            actualPricePct
        });
    }

    return data;
}