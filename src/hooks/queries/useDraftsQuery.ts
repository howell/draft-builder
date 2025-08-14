import { useMemo } from 'react';
import { LeagueId } from '@/platforms/common';
import { useUserDraftsQuery, DraftInfo } from './useUserDraftsQuery';

export interface UserDraftsData {
  drafts: DraftInfo[];
  totalDrafts: number;
  totalSelections: number;
  totalAdjustments: number;
  mostRecentDraft?: {
    draftName: string;
    leagueId: LeagueId;
    lastModified: Date;
  };
}

export function useDraftsQuery(leagueIds?: LeagueId[]) {
  const baseQuery = useUserDraftsQuery(leagueIds);
  
  // Transform raw draft data into summary format
  const data = useMemo((): UserDraftsData | undefined => {
    if (!baseQuery.data) return undefined;
    
    const drafts = baseQuery.data;
    const totalSelections = drafts.reduce((sum, draft) => sum + draft.selectionCount, 0);
    const totalAdjustments = drafts.reduce((sum, draft) => sum + draft.adjustmentCount, 0);
    const mostRecentDraft = drafts.length > 0 ? {
      draftName: drafts[0].draftName,
      leagueId: drafts[0].leagueId,
      lastModified: drafts[0].lastModified,
    } : undefined;
    
    return {
      drafts,
      totalDrafts: drafts.length,
      totalSelections,
      totalAdjustments,
      mostRecentDraft,
    };
  }, [baseQuery.data]);
  
  return {
    ...baseQuery,
    data,
  };
}