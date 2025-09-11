'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth/context';
import { LeagueId } from '@/platforms/common';
import { 
    LiveDraftState, 
    LiveDraftPick, 
    DraftTeam, 
    LiveDraftSettings,
    SpendingTrends,
    RosterAnalysis,
    DraftStateSnapshot
} from '@/app/storage/savedLiveDraftTypes';
import { 
    LiveDraftPredictor, 
    PredictorConfig, 
    TrainingStatus, 
    LivePredictionResult,
    HistoricalDraftData 
} from '@/lib/models/live-draft/liveDraftPredictor';
import { analyzeSpendingTrends, analyzeRosterNeeds } from './spendingAnalyzer';
import { RankedPlayer } from '@/types/storage';
import { RosterSettings } from '@/platforms/PlatformApi';
import { computeRosterSlots } from '../mocks/MockTable';
import { createBaselineModels, BaselineDraftPick } from '@/app/league/analytics';

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
 */
export function useLiveDraft({
    leagueId,
    draftId,
    autoSave = true,
    historicalData = []
}: UseLiveDraftConfig): UseLiveDraftReturn {
    const { storageAdapter } = useAuth();
    
    // Core state
    const [draftState, setDraftState] = useState<LiveDraftState | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState<boolean>(false);
    
    // Prediction engine state
    const [predictor, setPredictor] = useState<LiveDraftPredictor | null>(null);
    const [trainingStatus, setTrainingStatus] = useState<TrainingStatus | null>(null);

    // Computed analysis using useMemo for performance
    const spendingTrends = useMemo(() => {
        if (!draftState) return { positionSpending: {}, overallInflation: 0 };
        return analyzeSpendingTrends(draftState);
    }, [draftState]);

    const rosterAnalysis = useMemo(() => {
        if (!draftState) return { unfilledPositions: {}, budgetStatus: { averageRemaining: 0, highestRemaining: { teamId: '', amount: 0 }, lowestRemaining: { teamId: '', amount: 0 }, teamsInTrouble: 0 }, projectedSpending: {} };
        return analyzeRosterNeeds(draftState);
    }, [draftState]);

    // Initialize predictor when draft state is available
    useEffect(() => {
        if (!draftState) {
            setPredictor(null);
            return;
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
                console.warn('No historical data available for baseline models');
                setError('No historical data available for price predictions');
                return;
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

            const newPredictor = new LiveDraftPredictor(config);
            setPredictor(newPredictor);
        } catch (err) {
            console.error('Failed to initialize predictor:', err);
            setError('Failed to initialize prediction engine');
        }
    }, [draftState, historicalData]);

    // Load initial draft state
    useEffect(() => {
        const loadInitialState = async () => {
            try {
                setLoading(true);
                setError(null);

                if (draftId) {
                    // Load existing draft
                    const loadedDraft = await storageAdapter.loadLiveDraft(leagueId, draftId);
                    if (loadedDraft) {
                        setDraftState(loadedDraft);
                    } else {
                        setError(`Draft ${draftId} not found`);
                    }
                } else {
                    // No specific draft ID - could load most recent or start fresh
                    setDraftState(null);
                }
            } catch (err) {
                console.error('Failed to load draft state:', err);
                setError(err instanceof Error ? err.message : 'Failed to load draft');
            } finally {
                setLoading(false);
            }
        };

        loadInitialState();
    }, [leagueId, draftId, storageAdapter]);

    // Auto-save functionality
    useEffect(() => {
        if (!autoSave || !draftState || loading || saving) return;

        const saveTimer = setTimeout(async () => {
            try {
                setSaving(true);
                await storageAdapter.saveLiveDraft(leagueId, draftState);
            } catch (err) {
                console.error('Auto-save failed:', err);
                // Don't set error state for auto-save failures to avoid disrupting UX
            } finally {
                setSaving(false);
            }
        }, 1000); // Debounce auto-save by 1 second

        return () => clearTimeout(saveTimer);
    }, [draftState, autoSave, leagueId, storageAdapter, loading, saving]);

    // Pick management functions
    const addPick = useCallback(async (player: RankedPlayer, price: number, teamId: string) => {
        if (!draftState) {
            throw new Error('No draft state available');
        }

        try {
            const newPickNumber = draftState.currentPickNumber;
            const team = draftState.teams.find(t => t.id === teamId);
            if (!team) {
                throw new Error(`Team ${teamId} not found`);
            }

            const newPick: LiveDraftPick = {
                pickNumber: newPickNumber,
                teamId,
                teamName: team.name,
                player,
                price,
                timestamp: new Date()
            };

            // Update team budget and roster
            const updatedTeams = draftState.teams.map(t => {
                if (t.id === teamId) {
                    return {
                        ...t,
                        remainingBudget: t.remainingBudget - price,
                        filledPositions: {
                            ...t.filledPositions,
                            [player.defaultPosition]: (t.filledPositions[player.defaultPosition] || 0) + 1
                        }
                    };
                }
                return t;
            });

            // Update draft state
            const updatedDraftState: LiveDraftState = {
                ...draftState,
                picks: [...draftState.picks, newPick],
                teams: updatedTeams,
                currentPickNumber: newPickNumber + 1,
                modified: Date.now(),
                stateSnapshot: updateStateSnapshot(draftState, newPick)
            };

            setDraftState(updatedDraftState);

            // Persist the pick
            await storageAdapter.addLiveDraftPick(leagueId, draftState.draftId, newPick);
        } catch (err) {
            console.error('Failed to add pick:', err);
            setError(err instanceof Error ? err.message : 'Failed to add pick');
            throw err;
        }
    }, [draftState, leagueId, storageAdapter]);

    const updatePick = useCallback(async (pickNumber: number, updates: Partial<LiveDraftPick>) => {
        if (!draftState) {
            throw new Error('No draft state available');
        }

        try {
            const pickIndex = draftState.picks.findIndex(p => p.pickNumber === pickNumber);
            if (pickIndex === -1) {
                throw new Error(`Pick ${pickNumber} not found`);
            }

            const oldPick = draftState.picks[pickIndex];
            const updatedPick = { ...oldPick, ...updates };

            // Update picks array
            const updatedPicks = [...draftState.picks];
            updatedPicks[pickIndex] = updatedPick;

            // Recalculate team budgets and roster (simplified - full implementation would be more complex)
            const updatedDraftState: LiveDraftState = {
                ...draftState,
                picks: updatedPicks,
                modified: Date.now()
            };

            setDraftState(updatedDraftState);

            // Persist the update
            await storageAdapter.updateLiveDraftPick(leagueId, draftState.draftId, pickNumber, updatedPick);
        } catch (err) {
            console.error('Failed to update pick:', err);
            setError(err instanceof Error ? err.message : 'Failed to update pick');
            throw err;
        }
    }, [draftState, leagueId, storageAdapter]);

    const deletePick = useCallback(async (pickNumber: number) => {
        if (!draftState) {
            throw new Error('No draft state available');
        }

        try {
            const pickIndex = draftState.picks.findIndex(p => p.pickNumber === pickNumber);
            if (pickIndex === -1) {
                throw new Error(`Pick ${pickNumber} not found`);
            }

            // Remove pick and renumber subsequent picks
            const updatedPicks = draftState.picks
                .filter(p => p.pickNumber !== pickNumber)
                .map(p => p.pickNumber > pickNumber ? { ...p, pickNumber: p.pickNumber - 1 } : p);

            // Recalculate team budgets and roster (simplified)
            const updatedDraftState: LiveDraftState = {
                ...draftState,
                picks: updatedPicks,
                currentPickNumber: Math.max(1, draftState.currentPickNumber - 1),
                modified: Date.now()
            };

            setDraftState(updatedDraftState);

            // Persist the deletion
            await storageAdapter.deleteLiveDraftPick(leagueId, draftState.draftId, pickNumber);
        } catch (err) {
            console.error('Failed to delete pick:', err);
            setError(err instanceof Error ? err.message : 'Failed to delete pick');
            throw err;
        }
    }, [draftState, leagueId, storageAdapter]);

    const undoLastPick = useCallback(async () => {
        if (!draftState || draftState.picks.length === 0) {
            throw new Error('No picks to undo');
        }

        const lastPick = draftState.picks[draftState.picks.length - 1];
        await deletePick(lastPick.pickNumber);
    }, [draftState, deletePick]);

    // Draft management functions
    const createDraft = useCallback(async (settings: LiveDraftSettings) => {
        try {
            setLoading(true);
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
            await storageAdapter.saveLiveDraft(leagueId, newDraftState);
        } catch (err) {
            console.error('Failed to create draft:', err);
            setError(err instanceof Error ? err.message : 'Failed to create draft');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [leagueId, storageAdapter]);

    const loadDraft = useCallback(async (draftId: string) => {
        try {
            setLoading(true);
            setError(null);

            const loadedDraft = await storageAdapter.loadLiveDraft(leagueId, draftId);
            if (loadedDraft) {
                setDraftState(loadedDraft);
            } else {
                throw new Error(`Draft ${draftId} not found`);
            }
        } catch (err) {
            console.error('Failed to load draft:', err);
            setError(err instanceof Error ? err.message : 'Failed to load draft');
            throw err;
        } finally {
            setLoading(false);
        }
    }, [leagueId, storageAdapter]);

    const saveDraft = useCallback(async () => {
        if (!draftState) {
            throw new Error('No draft state to save');
        }

        try {
            setSaving(true);
            await storageAdapter.saveLiveDraft(leagueId, draftState);
        } catch (err) {
            console.error('Failed to save draft:', err);
            setError(err instanceof Error ? err.message : 'Failed to save draft');
            throw err;
        } finally {
            setSaving(false);
        }
    }, [draftState, leagueId, storageAdapter]);

    const deleteDraft = useCallback(async () => {
        if (!draftState) {
            throw new Error('No draft state to delete');
        }

        try {
            await storageAdapter.deleteLiveDraft(leagueId, draftState.draftId);
            setDraftState(null);
        } catch (err) {
            console.error('Failed to delete draft:', err);
            setError(err instanceof Error ? err.message : 'Failed to delete draft');
            throw err;
        }
    }, [draftState, leagueId, storageAdapter]);

    // Prediction functions
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
            setError(err instanceof Error ? err.message : 'Failed to train model');
            throw err;
        }
    }, [predictor, draftState]);

    const getBaselinePrediction = useCallback((pickNumber: number) => {
        if (!predictor) return 0;
        return predictor.getBaselinePrediction(pickNumber);
    }, [predictor]);

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

    // Utility functions
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    const resetDraft = useCallback(() => {
        setDraftState(null);
        setPredictor(null);
        setTrainingStatus(null);
        setError(null);
    }, []);

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
        loadDraft,
        saveDraft,
        deleteDraft,
        
        // Prediction functions
        trainModel,
        getBaselinePrediction,
        getLivePrediction,
        
        // Utility functions
        clearError,
        resetDraft
    };
}

/**
 * Helper function to update draft state snapshot after a pick
 * This is a simplified version - full implementation would be more comprehensive
 */
function updateStateSnapshot(currentState: LiveDraftState, newPick: LiveDraftPick): DraftStateSnapshot {
    const totalBudget = currentState.settings.totalBudget * currentState.settings.teamCount;
    const totalSpent = [...currentState.picks, newPick].reduce((sum, pick) => sum + pick.price, 0);
    const totalBudgetSpentPct = (totalSpent / totalBudget) * 100;

    // Group spending by position
    const budgetSpentByPositionPct: Record<string, number> = {};
    const playersPickedByPosition: Record<string, number> = {};

    [...currentState.picks, newPick].forEach(pick => {
        const position = pick.player.defaultPosition;
        budgetSpentByPositionPct[position] = (budgetSpentByPositionPct[position] || 0) + (pick.price / totalBudget) * 100;
        playersPickedByPosition[position] = (playersPickedByPosition[position] || 0) + 1;
    });

    // Calculate budget distribution (simplified)
    const remainingBudgets = currentState.teams.map(team => {
        const teamSpent = [...currentState.picks, newPick]
            .filter(pick => pick.teamId === team.id)
            .reduce((sum, pick) => sum + pick.price, 0);
        return ((team.budget - teamSpent) / team.budget) * 100;
    });

    const budgetDistribution = {
        averageRemainingPct: remainingBudgets.reduce((sum, pct) => sum + pct, 0) / remainingBudgets.length,
        medianRemainingPct: remainingBudgets.sort((a, b) => a - b)[Math.floor(remainingBudgets.length / 2)],
        minRemainingPct: Math.min(...remainingBudgets),
        maxRemainingPct: Math.max(...remainingBudgets),
        teamsWithLowBudgetPct: (remainingBudgets.filter(pct => pct < 10).length / remainingBudgets.length) * 100
    };

    return {
        pickNumber: newPick.pickNumber,
        totalBudgetSpentPct,
        budgetSpentByPositionPct,
        playersPickedByPosition,
        budgetDistribution,
        positionScarcityMetrics: {} // Would be calculated in full implementation
    };
}