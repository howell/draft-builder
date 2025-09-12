'use client';

import { useCallback } from 'react';
import { useAuth } from '@/lib/auth/context';
import { LeagueId } from '@/platforms/common';
import { 
    LiveDraftState, 
    LiveDraftPick, 
    DraftStateSnapshot 
} from '@/app/storage/savedLiveDraftTypes';
import { RankedPlayer } from '@/types/storage';

export interface UseLiveDraftPicksOptions {
  leagueId: LeagueId;
  draftState: LiveDraftState | null;
  onStateChange: (newState: LiveDraftState) => void;
  onError: (error: string) => void;
}

export interface UseLiveDraftPicksReturn {
  // Pick management functions
  addPick: (player: RankedPlayer, price: number, teamId: string) => Promise<void>;
  updatePick: (pickNumber: number, updates: Partial<LiveDraftPick>) => Promise<void>;
  deletePick: (pickNumber: number) => Promise<void>;
  undoLastPick: () => Promise<void>;
}

/**
 * Hook for managing live draft pick operations (CRUD)
 */
export function useLiveDraftPicks({
  leagueId,
  draftState,
  onStateChange,
  onError
}: UseLiveDraftPicksOptions): UseLiveDraftPicksReturn {
  const { storageAdapter } = useAuth();

  // Add a new pick to the draft
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

      onStateChange(updatedDraftState);

      // Persist the pick
      await storageAdapter.addLiveDraftPick(leagueId, draftState.draftId, newPick);
    } catch (err) {
      console.error('Failed to add pick:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to add pick';
      onError(errorMessage);
      throw err;
    }
  }, [draftState, leagueId, storageAdapter, onStateChange, onError]);

  // Update an existing pick
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
      // For now, just update the picks and let the parent handle full recalculation
      const updatedDraftState: LiveDraftState = {
        ...draftState,
        picks: updatedPicks,
        modified: Date.now()
      };

      onStateChange(updatedDraftState);

      // Persist the update
      await storageAdapter.updateLiveDraftPick(leagueId, draftState.draftId, pickNumber, updatedPick);
    } catch (err) {
      console.error('Failed to update pick:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to update pick';
      onError(errorMessage);
      throw err;
    }
  }, [draftState, leagueId, storageAdapter, onStateChange, onError]);

  // Delete a pick and renumber subsequent picks
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
      // For now, just update the picks and let the parent handle full recalculation
      const updatedDraftState: LiveDraftState = {
        ...draftState,
        picks: updatedPicks,
        currentPickNumber: Math.max(1, draftState.currentPickNumber - 1),
        modified: Date.now()
      };

      onStateChange(updatedDraftState);

      // Persist the deletion
      await storageAdapter.deleteLiveDraftPick(leagueId, draftState.draftId, pickNumber);
    } catch (err) {
      console.error('Failed to delete pick:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete pick';
      onError(errorMessage);
      throw err;
    }
  }, [draftState, leagueId, storageAdapter, onStateChange, onError]);

  // Undo the last pick
  const undoLastPick = useCallback(async () => {
    if (!draftState || draftState.picks.length === 0) {
      throw new Error('No picks to undo');
    }

    const lastPick = draftState.picks[draftState.picks.length - 1];
    await deletePick(lastPick.pickNumber);
  }, [draftState, deletePick]);

  return {
    addPick,
    updatePick,
    deletePick,
    undoLastPick
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