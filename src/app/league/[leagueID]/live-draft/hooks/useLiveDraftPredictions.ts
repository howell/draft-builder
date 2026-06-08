'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { LiveDraftState } from '@/app/storage/savedLiveDraftTypes';
import { 
    LiveDraftPredictor, 
    PredictorConfig, 
    TrainingStatus, 
    LivePredictionResult,
    HistoricalDraftData 
} from '@/lib/models/live-draft/liveDraftPredictor';
import { RankedPlayer } from '@/types/storage';
import { createBaselineModels, BaselineDraftPick } from '@/app/league/analytics';

export interface UseLiveDraftPredictionsOptions {
  draftState: LiveDraftState | null;
  historicalData: HistoricalDraftData[];
  onError: (error: string) => void;
}

export interface UseLiveDraftPredictionsReturn {
  // Prediction engine state
  predictor: LiveDraftPredictor | null;
  trainingStatus: TrainingStatus | null;
  
  // Prediction functions
  trainModel: () => Promise<void>;
  getBaselinePrediction: (pickNumber: number) => number;
  getLivePrediction: (player: RankedPlayer) => Promise<LivePredictionResult | null>;
}

/**
 * Hook for managing live draft prediction engine and ML functionality
 */
export function useLiveDraftPredictions({
  draftState,
  historicalData,
  onError
}: UseLiveDraftPredictionsOptions): UseLiveDraftPredictionsReturn {
  // Prediction engine state
  const [trainingStatus, setTrainingStatus] = useState<TrainingStatus | null>(null);

  // Build the prediction engine whenever the draft state or historical data changes.
  // Computed during render (memoized); any initialization error is surfaced via onError
  // from an effect below so that render itself stays free of side effects.
  const { predictor, predictorError } = useMemo<{ predictor: LiveDraftPredictor | null; predictorError: string | null }>(() => {
    if (!draftState) {
      return { predictor: null, predictorError: null };
    }

    try {
      // Create baseline models from historical data using shared utility
      const allHistoricalPicks: BaselineDraftPick[] = historicalData.flatMap(draft =>
        draft.picks.map(pick => ({
          price: pick.price,
          position: pick.player.defaultPosition
        }))
      );

      if (allHistoricalPicks.length === 0) {
        return { predictor: null, predictorError: 'No historical data available for price predictions' };
      }

      const baselineModels = createBaselineModels(allHistoricalPicks);

      const config: PredictorConfig = {
        budgetConfig: {
          totalBudgetPerTeam: draftState.settings.totalBudget,
          teamCount: draftState.settings.teamCount
        },
        baselineModels,
        historicalData
      };

      return { predictor: new LiveDraftPredictor(config), predictorError: null };
    } catch (err) {
      console.error('Failed to initialize predictor:', err);
      return { predictor: null, predictorError: 'Failed to initialize prediction engine' };
    }
  }, [draftState, historicalData]);

  useEffect(() => {
    if (predictorError) {
      onError(predictorError);
    }
  }, [predictorError, onError]);

  // Train the prediction model
  const trainModel = useCallback(async () => {
    if (!predictor || !draftState) {
      throw new Error('Predictor not available');
    }

    try {
      const context = {
        picks: draftState.picks.map(pick => ({
          player: pick.player,
          price: pick.price,
          pickNumber: pick.pickNumber
        })),
        currentPickNumber: draftState.currentPickNumber,
        totalPicks: draftState.settings.teamCount * 15, // Assuming 15 roster spots
        budgetConfig: {
          totalBudgetPerTeam: draftState.settings.totalBudget,
          teamCount: draftState.settings.teamCount
        }
      };

      const status = await predictor.trainModel(context);
      setTrainingStatus(status);
    } catch (err) {
      console.error('Failed to train model:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to train model';
      onError(errorMessage);
      throw err;
    }
  }, [predictor, draftState, onError]);

  // Get baseline price prediction for a pick number
  const getBaselinePrediction = useCallback((pickNumber: number) => {
    if (!predictor) return 0;
    return predictor.getBaselinePrediction(pickNumber);
  }, [predictor]);

  // Get live prediction for a specific player
  const getLivePrediction = useCallback(async (player: RankedPlayer): Promise<LivePredictionResult | null> => {
    if (!predictor || !draftState) return null;

    try {
      const context = {
        picks: draftState.picks.map(pick => ({
          player: pick.player,
          price: pick.price,
          pickNumber: pick.pickNumber
        })),
        currentPickNumber: draftState.currentPickNumber,
        totalPicks: draftState.settings.teamCount * 15,
        budgetConfig: {
          totalBudgetPerTeam: draftState.settings.totalBudget,
          teamCount: draftState.settings.teamCount
        }
      };

      return predictor.getLivePrediction(player, context);
    } catch (err) {
      console.error('Failed to get live prediction:', err);
      return null;
    }
  }, [predictor, draftState]);

  return {
    // Prediction engine state
    predictor,
    trainingStatus,
    
    // Prediction functions
    trainModel,
    getBaselinePrediction,
    getLivePrediction
  };
}