/**
 * On-demand linear regression trainer for live draft price predictions
 * 
 * Uses ml-regression package for reliable multiple linear regression with 
 * categorical variable support. Designed for on-demand training (1-10ms).
 */

import { MultivariateLinearRegression } from 'ml-regression';
import { LiveDraftFeatures } from "./featureExtraction";

export interface TrainingDataPoint {
    features: LiveDraftFeatures;
    actualPricePct: number; // target variable (percentage of total budget)
}

export interface LinearRegressionModel {
    regression: MultivariateLinearRegression;
    coefficients: ModelCoefficients;
    statistics: ModelStatistics;
    positions: string[]; // position order used for encoding
}

export interface ModelCoefficients {
    intercept: number;
    // Position coefficients (one-hot encoded, in order of positions array)
    positions: Record<string, number>;
    // Continuous feature coefficients
    playerPositionRank: number;
    playerOverallRank: number;
    positionScarcity: number;
    overallScarcity: number;
    budgetSpentPct: number;
    budgetPressure: number;
    positionalPressure: number;
}

export interface ModelStatistics {
    r2: number; // coefficient of determination
    adjustedR2: number; // adjusted for degrees of freedom
    sampleSize: number;
    standardError: number;
    meanAbsoluteError: number;
}

export interface PredictionResult {
    prediction: number; // predicted price as percentage
    components: PredictionComponents;
    confidence: number; // 0-1, based on model R²
}

export interface PredictionComponents {
    intercept: number;
    positionComponent: number;
    playerCharacteristicsComponent: number; // ranks
    scarcityComponent: number; // position + overall scarcity
    contextComponent: number; // budget pressure features
}

/**
 * Linear regression trainer using ml-regression package
 */
export class LinearRegressionTrainer {
    private readonly positions: string[];

    constructor(positions: string[]) {
        this.positions = positions.sort(); // consistent ordering
    }

    /**
     * Train linear regression model on-demand
     */
    train(trainingData: TrainingDataPoint[]): LinearRegressionModel {
        if (trainingData.length < 10) {
            throw new Error(`Insufficient training data: ${trainingData.length} samples (minimum 10 required)`);
        }

        // Prepare training matrices
        const { X, y } = this.prepareTrainingData(trainingData);
        
        // Train model using ml-regression
        const regression = new MultivariateLinearRegression(X, y, { intercept: true, statistics: true });
        
        // Structure coefficients for interpretability
        const coefficients = this.extractCoefficients(regression);
        
        // Calculate additional statistics
        const statistics = this.calculateStatistics(regression, trainingData.length, X, y);
        
        return {
            regression,
            coefficients,
            statistics,
            positions: this.positions
        };
    }

    /**
     * Make prediction with trained model
     */
    makePrediction(
        features: LiveDraftFeatures,
        model: LinearRegressionModel
    ): PredictionResult {
        // Convert features to vector
        const featureVector = this.featuresToVector(features);
        
        // Make prediction using trained model
        const predictionArray = model.regression.predict(featureVector);
        const prediction = predictionArray[0]; // Extract single value from 2D result
        
        // Calculate prediction components for interpretability
        const components = this.calculateComponents(features, model.coefficients);
        
        // Use R² as confidence measure
        const confidence = Math.max(0, Math.min(1, model.statistics.r2));
        
        return {
            prediction,
            components,
            confidence
        };
    }

    /**
     * Prepare training data matrices
     */
    private prepareTrainingData(trainingData: TrainingDataPoint[]): { X: number[][], y: number[][] } {
        const X: number[][] = [];
        const y: number[][] = [];

        for (const dataPoint of trainingData) {
            X.push(this.featuresToVector(dataPoint.features));
            y.push([dataPoint.actualPricePct]); // Convert to 2D array for ml-regression
        }

        return { X, y };
    }

    /**
     * Convert features to numeric vector with one-hot encoding for positions
     */
    private featuresToVector(features: LiveDraftFeatures): number[] {
        // One-hot encode position (exclude one category to avoid multicollinearity)
        const positionEncoding = this.positions.slice(1).map(pos => 
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

    /**
     * Extract and structure coefficients from trained model
     */
    private extractCoefficients(regression: MultivariateLinearRegression): ModelCoefficients {
        const coeffs = regression.weights.map(w => Array.isArray(w) ? w[0] : w); // Extract scalars from 2D weights
        let index = 0;
        
        // Position coefficients (first position is reference category, coefficient = 0)
        const positions: Record<string, number> = {};
        positions[this.positions[0]] = 0; // reference category
        
        for (let i = 1; i < this.positions.length; i++) {
            positions[this.positions[i]] = coeffs[index++];
        }
        
        return {
            intercept: Array.isArray(regression.intercept) ? regression.intercept[0] : regression.intercept,
            positions,
            playerPositionRank: coeffs[index++],
            playerOverallRank: coeffs[index++],
            positionScarcity: coeffs[index++],
            overallScarcity: coeffs[index++],
            budgetSpentPct: coeffs[index++],
            budgetPressure: coeffs[index++],
            positionalPressure: coeffs[index++]
        };
    }

    /**
     * Calculate model statistics
     */
    private calculateStatistics(
        regression: MultivariateLinearRegression, 
        sampleSize: number,
        X: number[][],
        y: number[][]
    ): ModelStatistics {
        // Use the library's standard error (available when statistics=true)
        const standardError = regression.stdError || 0;
        
        // Calculate R² manually since library doesn't implement it
        const predictions = X.map(row => regression.predict(row));
        const r2 = this.calculateR2(y, predictions);
        
        // Calculate adjusted R²
        const numFeatures = this.positions.length - 1 + 7; // positions (minus reference) + 7 continuous
        const adjustedR2 = 1 - ((1 - r2) * (sampleSize - 1)) / (sampleSize - numFeatures - 1);
        
        // Calculate mean absolute error
        const meanAbsoluteError = this.calculateMeanAbsoluteError(y, predictions);
        
        return {
            r2,
            adjustedR2,
            sampleSize,
            standardError,
            meanAbsoluteError
        };
    }

    /**
     * Calculate R² coefficient of determination manually
     */
    private calculateR2(actual: number[][], predicted: number[][]): number {
        if (actual.length === 0 || predicted.length === 0) return 0;
        
        // Convert to 1D arrays for easier calculation
        const actualFlat = actual.map(row => row[0]);
        const predictedFlat = predicted.map(row => row[0]);
        
        // Calculate mean of actual values
        const actualMean = actualFlat.reduce((sum, val) => sum + val, 0) / actualFlat.length;
        
        // Calculate total sum of squares (TSS)
        const tss = actualFlat.reduce((sum, val) => sum + Math.pow(val - actualMean, 2), 0);
        
        // Calculate residual sum of squares (RSS)
        const rss = actualFlat.reduce((sum, val, i) => sum + Math.pow(val - predictedFlat[i], 2), 0);
        
        // R² = 1 - (RSS / TSS)
        return tss === 0 ? 0 : 1 - (rss / tss);
    }

    /**
     * Calculate mean absolute error
     */
    private calculateMeanAbsoluteError(actual: number[][], predicted: number[][]): number {
        if (actual.length === 0 || predicted.length === 0) return 0;
        
        const actualFlat = actual.map(row => row[0]);
        const predictedFlat = predicted.map(row => row[0]);
        
        const totalError = actualFlat.reduce((sum, val, i) => 
            sum + Math.abs(val - predictedFlat[i]), 0
        );
        
        return totalError / actualFlat.length;
    }

    /**
     * Calculate prediction components for interpretability
     */
    private calculateComponents(
        features: LiveDraftFeatures,
        coefficients: ModelCoefficients
    ): PredictionComponents {
        return {
            intercept: coefficients.intercept,
            positionComponent: coefficients.positions[features.playerPosition] || 0,
            playerCharacteristicsComponent: 
                coefficients.playerPositionRank * features.playerPositionRank +
                coefficients.playerOverallRank * features.playerOverallRank,
            scarcityComponent: 
                coefficients.positionScarcity * features.positionScarcity +
                coefficients.overallScarcity * features.overallScarcity,
            contextComponent: 
                coefficients.budgetSpentPct * features.budgetSpentPct +
                coefficients.budgetPressure * features.budgetPressure +
                coefficients.positionalPressure * features.positionalPressure
        };
    }

    /**
     * Validate features are reasonable for prediction
     */
    static validateFeatures(features: LiveDraftFeatures): boolean {
        // Ranks should be positive
        if (features.playerPositionRank <= 0 || features.playerOverallRank <= 0) return false;
        
        // Scarcity should be 0-1
        if (features.positionScarcity < 0 || features.positionScarcity > 1) return false;
        if (features.overallScarcity < 0 || features.overallScarcity > 1) return false;
        
        // Budget spent should be 0-1
        if (features.budgetSpentPct < 0 || features.budgetSpentPct > 1) return false;
        
        // Pressure metrics should be reasonable (-10 to +10)
        if (Math.abs(features.budgetPressure) > 10) return false;
        if (Math.abs(features.positionalPressure) > 10) return false;
        
        return true;
    }

    /**
     * Get minimum sample size recommendation for given number of positions
     */
    static getMinimumSampleSize(numPositions: number): number {
        const numFeatures = Math.max(1, numPositions - 1) + 7; // positions + continuous features
        return Math.max(20, numFeatures * 3); // at least 3 samples per feature
    }
}