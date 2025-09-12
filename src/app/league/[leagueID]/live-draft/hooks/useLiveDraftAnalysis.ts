'use client';

import { useMemo } from 'react';
import { LiveDraftState, SpendingTrends, RosterAnalysis } from '@/app/storage/savedLiveDraftTypes';
import { analyzeSpendingTrends, analyzeRosterNeeds } from '../spendingAnalyzer';

export interface UseLiveDraftAnalysisOptions {
  draftState: LiveDraftState | null;
}

export interface UseLiveDraftAnalysisReturn {
  // Computed analysis
  spendingTrends: SpendingTrends;
  rosterAnalysis: RosterAnalysis;
  
  // Analysis metrics (derived from the main analysis)
  overallInflation: number;
  teamsInTrouble: number;
  totalUnfilledPositions: number;
  highestBudgetTeam: { teamId: string; amount: number } | null;
  lowestBudgetTeam: { teamId: string; amount: number } | null;
}

/**
 * Hook for calculating and managing live draft analysis (spending trends, roster needs)
 */
export function useLiveDraftAnalysis({
  draftState
}: UseLiveDraftAnalysisOptions): UseLiveDraftAnalysisReturn {

  // Calculate spending trends using memoization for performance
  const spendingTrends = useMemo((): SpendingTrends => {
    if (!draftState) {
      return { positionSpending: {}, overallInflation: 0 };
    }
    return analyzeSpendingTrends(draftState);
  }, [draftState]);

  // Calculate roster analysis using memoization for performance
  const rosterAnalysis = useMemo((): RosterAnalysis => {
    if (!draftState) {
      return {
        unfilledPositions: {},
        budgetStatus: {
          averageRemaining: 0,
          highestRemaining: { teamId: '', amount: 0 },
          lowestRemaining: { teamId: '', amount: 0 },
          teamsInTrouble: 0,
        },
        projectedSpending: {}
      };
    }
    return analyzeRosterNeeds(draftState);
  }, [draftState]);

  // Derived metrics from the analysis for quick access
  const overallInflation = useMemo(() => spendingTrends.overallInflation, [spendingTrends]);

  const teamsInTrouble = useMemo(() => rosterAnalysis.budgetStatus.teamsInTrouble, [rosterAnalysis]);

  const totalUnfilledPositions = useMemo(() => {
    return Object.values(rosterAnalysis.unfilledPositions)
      .reduce((total, position) => total + position.remainingSlots, 0);
  }, [rosterAnalysis.unfilledPositions]);

  const highestBudgetTeam = useMemo(() => {
    const { highestRemaining } = rosterAnalysis.budgetStatus;
    return highestRemaining.amount > 0 ? highestRemaining : null;
  }, [rosterAnalysis.budgetStatus]);

  const lowestBudgetTeam = useMemo(() => {
    const { lowestRemaining } = rosterAnalysis.budgetStatus;
    return lowestRemaining.amount >= 0 ? lowestRemaining : null;
  }, [rosterAnalysis.budgetStatus]);

  return {
    // Core analysis
    spendingTrends,
    rosterAnalysis,
    
    // Derived metrics for convenience
    overallInflation,
    teamsInTrouble,
    totalUnfilledPositions,
    highestBudgetTeam,
    lowestBudgetTeam
  };
}