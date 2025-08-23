import { useMemo } from 'react';
import { LeagueId } from '@/platforms/common';
import { useUserDraftsQuery } from './useUserDraftsQuery';

export interface MockDraft {
  draftName: string;
  leagueName: string;
  leagueId: LeagueId;
  year: string;
  lastModified: Date;
  selectionCount: number;
  adjustmentCount: number;
}

export function useMockDraftsQuery(leagueIds?: LeagueId[]) {
  const baseQuery = useUserDraftsQuery(leagueIds);
  
  // Transform raw draft data into MockDraft format
  const data = useMemo((): MockDraft[] | undefined => {
    if (!baseQuery.data) return undefined;
    
    return baseQuery.data.map(draft => ({
      ...draft,
      leagueName: draft.leagueId, // TODO: Could be enhanced to get actual league name
    }));
  }, [baseQuery.data]);
  
  return {
    ...baseQuery,
    data,
  };
}