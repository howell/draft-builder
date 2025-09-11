/**
 * Main prediction engine that coordinates live draft price predictions
 * 
 * Provides clear separation between training and prediction phases,
 * uses existing position discovery, and delegates to focused helper methods.
 */

import { BudgetConverter } from "./budgetConversions";
import { 
    FeatureExtractor, 
    DraftContext, 
    BaselineModels, 
    LiveDraftFeatures,
    DraftPick
} from "./featureExtraction";
import { 
    LinearRegressionTrainer, 
    LinearRegressionModel, 
    PredictionResult,
    TrainingDataPoint 
} from "./linearRegression";
import { predictPrice } from '@/app/league/analytics';

// Enhanced prediction with baseline comparison
export interface LivePredictionResult extends PredictionResult {
    predictionDollars: number;
    baselinePrediction: number;
    adjustment: number;
    adjustmentPercentage: number;
}

// Historical data interface
export interface HistoricalDraftData {
    picks: DraftPick[];
    budgetConfig: { totalBudgetPerTeam: number; teamCount: number };
}

// Training status for UX feedback
export interface TrainingStatus {
    isTraining: boolean;
    trainingDataSize: number;
    positions: string[];
    message: string;
}

// Predictor configuration
export interface PredictorConfig {
    budgetConfig: { totalBudgetPerTeam: number; teamCount: number };
    baselineModels: BaselineModels;
    historicalData: HistoricalDraftData[];
}

/**
 * Main live draft price predictor with clear training/prediction separation
 */
export class LiveDraftPredictor {
    private readonly config: PredictorConfig;
    private readonly budgetConverter: BudgetConverter;
    private readonly featureExtractor: FeatureExtractor;
    
    private trainedModel: LinearRegressionModel | null = null;
    private modelPositions: string[] = [];
    private trainingDataCache: TrainingDataPoint[] | null = null;

    constructor(config: PredictorConfig) {
        this.config = config;
        this.budgetConverter = new BudgetConverter(config.budgetConfig);
        this.featureExtractor = new FeatureExtractor(config.budgetConfig, config.baselineModels);
    }

    /**
     * Train model explicitly with status feedback
     */
    async trainModel(currentContext: DraftContext): Promise<TrainingStatus> {
        const positions = this.discoverPositions(currentContext);
        const trainingData = this.prepareTrainingData();
        
        const status: TrainingStatus = {
            isTraining: true,
            trainingDataSize: trainingData.length,
            positions,
            message: `Training model with ${trainingData.length} historical picks...`
        };

        const trainer = new LinearRegressionTrainer(positions);
        this.trainedModel = trainer.train(trainingData);
        this.modelPositions = positions;
        this.trainingDataCache = trainingData;

        return {
            ...status,
            isTraining: false,
            message: `Model trained successfully (R² = ${this.trainedModel.statistics.r2.toFixed(3)})`
        };
    }

    /**
     * Get baseline prediction (always available)
     */
    getBaselinePrediction(pickNumber: number): number {
        return predictPrice(this.config.baselineModels.overall, pickNumber);
    }

    /**
     * Get live model prediction (requires trained model)
     */
    getLivePrediction(
        player: { defaultPosition: string; positionRank: number; overallRank: number },
        currentContext: DraftContext
    ): LivePredictionResult {
        if (!this.isModelReady(currentContext)) {
            throw new Error('Model not trained or positions changed. Call trainModel() first.');
        }

        const features = this.featureExtractor.extractFeatures(player, currentContext);
        const trainer = new LinearRegressionTrainer(this.modelPositions);
        const prediction = trainer.makePrediction(features, this.trainedModel!);
        
        return this.enhancePredictionWithBaseline(prediction, currentContext.currentPickNumber);
    }

    /**
     * Validate baseline convergence in early draft
     */
    validateBaselineConvergence(tolerance: number = 0.15): BaselineValidationResult {
        if (!this.trainedModel) {
            throw new Error('Model not trained. Call trainModel() first.');
        }

        const testCases = this.generateEarlyDraftTestCases();
        const results = testCases.map(testCase => this.validateSingleCase(testCase));
        
        return this.summarizeValidationResults(results, tolerance);
    }

    /**
     * Check if model is ready for predictions
     */
    private isModelReady(context: DraftContext): boolean {
        if (!this.trainedModel) return false;
        
        const currentPositions = this.discoverPositions(context);
        return this.arraysEqual(this.modelPositions, currentPositions);
    }

    /**
     * Discover positions from current context and historical data
     */
    private discoverPositions(context: DraftContext): string[] {
        const allPicks = [
            ...context.picks,
            ...this.config.historicalData.flatMap(draft => draft.picks)
        ];
        
        return FeatureExtractor.discoverPositions(allPicks);
    }

    /**
     * Prepare training data from historical drafts
     */
    private prepareTrainingData(): TrainingDataPoint[] {
        if (this.trainingDataCache) {
            return this.trainingDataCache;
        }

        const trainingData: TrainingDataPoint[] = [];
        
        for (const historicalDraft of this.config.historicalData) {
            const draftTrainingData = this.extractTrainingFromDraft(historicalDraft);
            trainingData.push(...draftTrainingData);
        }

        return trainingData;
    }

    /**
     * Extract training data from single historical draft
     */
    private extractTrainingFromDraft(draft: HistoricalDraftData): TrainingDataPoint[] {
        const budgetConverter = new BudgetConverter(draft.budgetConfig);
        const featureExtractor = new FeatureExtractor(draft.budgetConfig, this.config.baselineModels);
        const trainingData: TrainingDataPoint[] = [];

        for (let i = 0; i < draft.picks.length; i++) {
            try {
                const pick = draft.picks[i];
                const contextAtPick = this.createContextAtPick(draft, i);
                
                const features = featureExtractor.extractFeatures(pick.player, contextAtPick);
                const actualPricePct = budgetConverter.toLeagueBudgetPercentage(pick.price);
                
                trainingData.push({ features, actualPricePct });
            } catch (error) {
                console.warn(`Failed to extract features for pick ${i}:`, error);
            }
        }

        return trainingData;
    }

    /**
     * Create draft context at specific pick
     */
    private createContextAtPick(draft: HistoricalDraftData, pickIndex: number): DraftContext {
        return {
            picks: draft.picks.slice(0, pickIndex),
            currentPickNumber: pickIndex + 1,
            totalPicks: draft.budgetConfig.teamCount * 15,
            budgetConfig: draft.budgetConfig
        };
    }

    /**
     * Enhance prediction with baseline comparison
     */
    private enhancePredictionWithBaseline(
        prediction: PredictionResult,
        pickNumber: number
    ): LivePredictionResult {
        const predictionDollars = this.budgetConverter.fromLeagueBudgetPercentage(prediction.prediction);
        const baselinePrediction = predictPrice(this.config.baselineModels.overall, pickNumber);
        const adjustment = predictionDollars - baselinePrediction;
        const adjustmentPercentage = baselinePrediction > 0 ? (adjustment / baselinePrediction) : 0;
        
        return {
            ...prediction,
            predictionDollars,
            baselinePrediction,
            adjustment,
            adjustmentPercentage
        };
    }

    /**
     * Generate test cases for baseline validation
     */
    private generateEarlyDraftTestCases(): ValidationTestCase[] {
        const testCases: ValidationTestCase[] = [];
        
        // Test early picks (1-20) with minimal context
        for (let pickNumber = 1; pickNumber <= 20; pickNumber++) {
            const emptyContext: DraftContext = {
                picks: [],
                currentPickNumber: pickNumber,
                totalPicks: this.config.budgetConfig.teamCount * 15,
                budgetConfig: this.config.budgetConfig
            };

            // Test sample of top players across discovered positions
            for (let rank = 1; rank <= 10; rank++) {
                const position = this.modelPositions[rank % this.modelPositions.length];
                const testPlayer = {
                    defaultPosition: position,
                    positionRank: Math.ceil(rank / this.modelPositions.length),
                    overallRank: rank
                };

                testCases.push({
                    pickNumber,
                    player: testPlayer,
                    context: emptyContext
                });
            }
        }

        return testCases;
    }

    /**
     * Validate single test case
     */
    private validateSingleCase(testCase: ValidationTestCase): ValidationResult {
        try {
            const features = this.featureExtractor.extractFeatures(testCase.player, testCase.context);
            const isEarlyState = this.isEarlyDraftState(features);
            const baselinePrediction = predictPrice(
                this.config.baselineModels.overall, 
                testCase.pickNumber
            );

            return {
                ...testCase,
                features,
                baselinePrediction,
                isEarlyState,
                converged: isEarlyState,
                error: null
            };
        } catch (error) {
            return {
                ...testCase,
                features: null,
                baselinePrediction: 0,
                isEarlyState: false,
                converged: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Check if features represent early draft state
     */
    private isEarlyDraftState(features: LiveDraftFeatures): boolean {
        const EARLY_THRESHOLDS = {
            budgetSpentPct: 0.05,
            pressureMagnitude: 0.1,
            scarcityThreshold: 0.05
        };
        
        return (
            features.budgetSpentPct <= EARLY_THRESHOLDS.budgetSpentPct &&
            Math.abs(features.budgetPressure) <= EARLY_THRESHOLDS.pressureMagnitude &&
            Math.abs(features.positionalPressure) <= EARLY_THRESHOLDS.pressureMagnitude &&
            features.positionScarcity <= EARLY_THRESHOLDS.scarcityThreshold &&
            features.overallScarcity <= EARLY_THRESHOLDS.scarcityThreshold
        );
    }

    /**
     * Summarize validation results
     */
    private summarizeValidationResults(
        results: ValidationResult[], 
        tolerance: number
    ): BaselineValidationResult {
        const convergenceErrors = results.filter(r => !r.converged).length;
        const convergenceRate = (results.length - convergenceErrors) / results.length;
        
        return {
            passed: convergenceRate >= (1 - tolerance),
            convergenceRate,
            tolerance,
            totalTests: results.length,
            convergenceErrors,
            results
        };
    }

    /**
     * Utility for array comparison
     */
    private arraysEqual(a: string[], b: string[]): boolean {
        return a.length === b.length && a.every((val, i) => val === b[i]);
    }

    // Public getters
    getModelStatistics() { return this.trainedModel?.statistics || null; }
    isModelTrained(): boolean { return this.trainedModel !== null; }
    getModelPositions(): string[] { return [...this.modelPositions]; }
    clearModel(): void { 
        this.trainedModel = null; 
        this.modelPositions = []; 
        this.trainingDataCache = null;
    }
}

// Supporting interfaces
interface ValidationTestCase {
    pickNumber: number;
    player: { defaultPosition: string; positionRank: number; overallRank: number };
    context: DraftContext;
}

interface ValidationResult extends ValidationTestCase {
    features: LiveDraftFeatures | null;
    baselinePrediction: number;
    isEarlyState: boolean;
    converged: boolean;
    error: string | null;
}

export interface BaselineValidationResult {
    passed: boolean;
    convergenceRate: number;
    tolerance: number;
    totalTests: number;
    convergenceErrors: number;
    results: ValidationResult[];
}