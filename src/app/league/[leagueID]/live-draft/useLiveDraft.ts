'use client';

import { useCallback } from 'react';
import { LeagueId } from '@/platforms/common';
import { 
    LiveDraftState, 
    LiveDraftPick, 
    DraftTeam, 
    LiveDraftSettings,
    SpendingTrends,
    RosterAnalysis
} from '@/app/storage/savedLiveDraftTypes';
import { 
    LiveDraftPredictor,
    TrainingStatus, 
    LivePredictionResult,
    HistoricalDraftData 
} from '@/lib/models/live-draft/liveDraftPredictor';
import { RankedPlayer } from '@/types/storage';
import { computeRosterSlots } from '../mocks/MockTable';

// Import the focused hooks
import { useLiveDraftState } from './hooks/useLiveDraftState';
import { useLiveDraftPicks } from './hooks/useLiveDraftPicks';
import { useLiveDraftPredictions } from './hooks/useLiveDraftPredictions';
import { useLiveDraftAnalysis } from './hooks/useLiveDraftAnalysis';

// Hook return type
export interface UseLiveDraftReturn {
    // State
    draftState: LiveDraftState | null;
    loading: boolean;
    error: string | null;
    saving: boolean;
    
    // Computed analysis
    spendingTrends: SpendingTrends;
    rosterAnalysis: RosterAnalysis;
    
    // Prediction engine
    predictor: LiveDraftPredictor | null;
    trainingStatus: TrainingStatus | null;
    
    // Pick management functions
    addPick: (player: RankedPlayer, price: number, teamId: string) => Promise<void>;
    updatePick: (pickNumber: number, updates: Partial<LiveDraftPick>) => Promise<void>;
    deletePick: (pickNumber: number) => Promise<void>;
    undoLastPick: () => Promise<void>;
    
    // Draft management
    createDraft: (settings: LiveDraftSettings) => Promise<void>;
    loadDraft: (draftId: string) => Promise<void>;
    saveDraft: () => Promise<void>;
    deleteDraft: () => Promise<void>;
    
    // Prediction functions
    trainModel: () => Promise<void>;
    getBaselinePrediction: (pickNumber: number) => number;
    getLivePrediction: (player: RankedPlayer) => Promise<LivePredictionResult | null>;
    
    // Utility functions
    clearError: () => void;
    resetDraft: () => void;
}

// Hook configuration
export interface UseLiveDraftConfig {
    leagueId: LeagueId;
    draftId?: string;
    autoSave?: boolean;
    historicalData?: HistoricalDraftData[];
}

/**
 * React hook for managing live draft state and operations
 * Composed of focused, specialized hooks for better maintainability
 */
export function useLiveDraft({
    leagueId,
    draftId,
    autoSave = true,
    historicalData = []
}: UseLiveDraftConfig): UseLiveDraftReturn {
    
    // Use the focused hooks
    const {
        draftState,
        loading,
        error,
        saving,
        setDraftState,
        setError,
        clearError,
        loadDraft: loadDraftState,
        saveDraft: saveDraftState,
        deleteDraft: deleteDraftState
    } = useLiveDraftState({ leagueId, draftId, autoSave });

    const {
        addPick,
        updatePick,
        deletePick,
        undoLastPick
    } = useLiveDraftPicks({
        leagueId,
        draftState,
        onStateChange: setDraftState,
        onError: setError
    });

    const {
        predictor,
        trainingStatus,
        trainModel,
        getBaselinePrediction,
        getLivePrediction
    } = useLiveDraftPredictions({
        draftState,
        historicalData,
        onError: setError
    });

    const {
        spendingTrends,
        rosterAnalysis
    } = useLiveDraftAnalysis({
        draftState
    });

    // Draft creation function (not extracted since it's specific to this main hook)
    const createDraft = useCallback(async (settings: LiveDraftSettings) => {
        try {
            setError(null);

            // Create initial teams
            const teams: DraftTeam[] = Array.from({ length: settings.teamCount }, (_, i) => ({
                id: `team-${i + 1}`,
                name: `Team ${i + 1}`,
                budget: settings.totalBudget,
                remainingBudget: settings.totalBudget,
                rosterSlots: computeRosterSlots(settings.rosterSettings),
                filledPositions: {}
            }));

            const newDraftState: LiveDraftState = {
                leagueId,
                draftId: `draft-${Date.now()}`,
                draftName: `Live Draft ${new Date().toLocaleDateString()}`,
                created: Date.now(),
                modified: Date.now(),
                picks: [],
                teams,
                currentPickNumber: 1,
                settings,
                stateSnapshot: {
                    pickNumber: 0,
                    totalBudgetSpentPct: 0,
                    budgetSpentByPositionPct: {},
                    playersPickedByPosition: {},
                    budgetDistribution: {
                        averageRemainingPct: 100,
                        medianRemainingPct: 100,
                        minRemainingPct: 100,
                        maxRemainingPct: 100,
                        teamsWithLowBudgetPct: 0
                    },
                    positionScarcityMetrics: {}
                }
            };

            setDraftState(newDraftState);
            await saveDraftState(newDraftState);
        } catch (err) {
            console.error('Failed to create draft:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to create draft';
            setError(errorMessage);
            throw err;
        }
    }, [leagueId, setDraftState, setError, saveDraftState]);

    // Reset draft function
    const resetDraft = useCallback(() => {
        setDraftState(null);
        clearError();
    }, [setDraftState, clearError]);

    return {
        // State
        draftState,
        loading,
        error,
        saving,
        
        // Computed analysis
        spendingTrends,
        rosterAnalysis,
        
        // Prediction engine
        predictor,
        trainingStatus,
        
        // Pick management functions
        addPick,
        updatePick,
        deletePick,
        undoLastPick,
        
        // Draft management
        createDraft,
        loadDraft: loadDraftState,
        saveDraft: () => saveDraftState(),
        deleteDraft: () => deleteDraftState(),
        
        // Prediction functions
        trainModel,
        getBaselinePrediction,
        getLivePrediction,
        
        // Utility functions
        clearError,
        resetDraft
    };
}