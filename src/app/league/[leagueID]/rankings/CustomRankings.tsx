'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LoadingScreen from '@/ui/LoadingScreen';
import ErrorScreen from '@/ui/ErrorScreen';
import Alert from '@/ui/Alert';
import { CURRENT_SEASON } from '@/constants';
import { LeagueId } from '@/platforms/common';
import { ScoringType } from '@/platforms/PlatformApi';
import { useAuth } from '@/lib/auth/context';
import {
  usePlayersQuery,
  useLeagueHistoryQuery,
  useRankingsQuery,
  useCustomRankingsQuery,
  useSaveCustomRankingsMutation,
} from '@/hooks/queries';
import { useLeagueQuery } from '@/hooks/queries/useLeagueQuery';
import {
  RANKABLE_POSITIONS,
  type CustomRankingItem,
  type RankablePosition,
} from '@/types/customRankings';
import {
  buildRankingPool,
  reconcileItems,
  type PositionPools,
} from '@/lib/rankings/customRankings';
import RankingsToolbar, { type SaveState } from './RankingsToolbar';
import PositionBoard from './PositionBoard';

export type CustomRankingsProps = {
  leagueId: LeagueId;
  googleApiKey: string;
};

type BoardState = Partial<Record<RankablePosition, CustomRankingItem[]>>;

const AUTOSAVE_DELAY_MS = 700;

const CustomRankings: React.FC<CustomRankingsProps> = ({ leagueId, googleApiKey }) => {
  const { loading: authLoading } = useAuth();

  const leagueQuery = useLeagueQuery(leagueId);
  const league = leagueQuery.data?.league;

  const playersQuery = usePlayersQuery(leagueId);
  const historyQuery = useLeagueHistoryQuery(leagueId);
  const scoringType = useScoringType(historyQuery.data);

  const players = useMemo(
    () => (Array.isArray(playersQuery.data) ? playersQuery.data : []),
    [playersQuery.data]
  );

  const rankingsQuery = useRankingsQuery(leagueId, league, googleApiKey, scoringType, players);
  const storedQuery = useCustomRankingsQuery(leagueId);
  const saveMutation = useSaveCustomRankingsMutation(leagueId);

  const [selectedPosition, setSelectedPosition] = useState<RankablePosition>('QB');
  const [hidePlatformRank, setHidePlatformRank] = useState(false);
  const [board, setBoard] = useState<BoardState | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const hydratedRef = useRef(false);

  // The first available ranking is the reference: for ESPN that is the
  // platform's own auction-value/rank ordering, for Sleeper the ADP sheet.
  const reference = rankingsQuery.data?.[0];

  const pools: PositionPools | null = useMemo(() => {
    if (!league || !players.length) {
      return null;
    }
    return buildRankingPool(league.platform, players, reference?.value);
  }, [league, players, reference]);

  const reconciled = useMemo(() => {
    if (!pools) {
      return null;
    }
    const result = {} as Record<RankablePosition, ReturnType<typeof reconcileItems>>;
    for (const position of RANKABLE_POSITIONS) {
      result[position] = reconcileItems(storedQuery.data?.positions?.[position], pools[position]);
    }
    return result;
  }, [pools, storedQuery.data]);

  // Hydrate local state once. Deriving on render would let a background refetch
  // clobber edits that have not been flushed yet.
  //
  // Wait for the rankings query as well as the stored board: until it settles
  // there is no reference ranking, so `buildRankingPool` falls back to
  // alphabetical order. Hydrating from that would freeze an alphabetical board
  // into local state, and the ranked pool that arrives moments later would only
  // partially match it.
  const referenceSettled = !rankingsQuery.isLoading && !rankingsQuery.isFetching;
  useEffect(() => {
    if (hydratedRef.current || !reconciled || storedQuery.isLoading || !referenceSettled) {
      return;
    }
    const next: BoardState = {};
    for (const position of RANKABLE_POSITIONS) {
      next[position] = reconciled[position].items;
    }
    setBoard(next);
    setHidePlatformRank(storedQuery.data?.hidePlatformRank ?? false);
    hydratedRef.current = true;
  }, [reconciled, storedQuery.isLoading, storedQuery.data, referenceSettled]);

  const persist = useCallback(
    (nextBoard: BoardState, nextHideRank: boolean) => {
      if (!league) {
        return;
      }
      setSaveState('saving');
      saveMutation.mutate(
        {
          platform: league.platform,
          season: CURRENT_SEASON,
          positions: nextBoard,
          hidePlatformRank: nextHideRank,
        },
        {
          onSuccess: () => setSaveState('saved'),
          onError: () => setSaveState('error'),
        }
      );
    },
    [league, saveMutation]
  );

  // Debounced autosave. There is no natural commit point in a drag interaction,
  // and an explicit Save button loses a long reordering session to a stray
  // navigation. The cleanup flushes immediately so leaving the page persists.
  const pendingRef = useRef<{ board: BoardState; hideRank: boolean } | null>(null);
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) {
      return;
    }
    const timer = setTimeout(() => {
      pendingRef.current = null;
      persist(pending.board, pending.hideRank);
    }, AUTOSAVE_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [board, hidePlatformRank, persist]);

  useEffect(() => {
    return () => {
      const pending = pendingRef.current;
      if (pending) {
        pendingRef.current = null;
        persist(pending.board, pending.hideRank);
      }
    };
    // Intentionally unmount-only: flush whatever is outstanding on the way out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateItems = useCallback(
    (position: RankablePosition, items: CustomRankingItem[]) => {
      setBoard(prev => {
        const next = { ...(prev ?? {}), [position]: items };
        pendingRef.current = { board: next, hideRank: hidePlatformRank };
        return next;
      });
    },
    [hidePlatformRank]
  );

  const toggleHideRank = useCallback(() => {
    setHidePlatformRank(prev => {
      const next = !prev;
      if (board) {
        pendingRef.current = { board, hideRank: next };
      }
      return next;
    });
  }, [board]);

  const error = leagueQuery.error || playersQuery.error || historyQuery.error || storedQuery.error;
  if (error) {
    return <ErrorScreen message={error.message} />;
  }

  const loadingDependencies = [
    { loading: authLoading, message: 'Authenticating...' },
    { query: leagueQuery as any, message: 'Loading league information' },
    { query: playersQuery as any, message: 'Fetching players' },
    { query: historyQuery as any, message: 'Fetching league history' },
    { query: rankingsQuery as any, message: 'Loading rankings' },
    { query: storedQuery as any, message: 'Loading your rankings' },
  ];

  return (
    <LoadingScreen waitFor={loadingDependencies}>
      <div className='md:ml-48 max-w-4xl'>
        <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1'>My Rankings</h1>
        <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
          Drag players into the order you actually believe in, and group them into tiers.
          Your board is saved automatically for this league.
        </p>

        {!reference && (
          <Alert variant='warning' className='mb-4'>
            Platform rankings are unavailable right now, so players are listed alphabetically.
            Any rankings you have already saved are unaffected.
          </Alert>
        )}

        {saveState === 'error' && (
          <Alert variant='error' className='mb-4'>
            Could not save your rankings. Your changes are still here — editing again will retry.
          </Alert>
        )}

        {board && pools && (
          <>
            <RankingsToolbar
              positions={RANKABLE_POSITIONS}
              selectedPosition={selectedPosition}
              onSelectPosition={setSelectedPosition}
              hidePlatformRank={hidePlatformRank}
              onToggleHidePlatformRank={toggleHideRank}
              hasReferenceRanking={!!reference}
              referenceLabel={typeof reference?.shortName === 'string' ? reference.shortName : 'Rank'}
              saveState={saveState}
            />

            <PositionBoard
              position={selectedPosition}
              items={board[selectedPosition] ?? []}
              pool={pools[selectedPosition]}
              hidePlatformRank={hidePlatformRank}
              referenceLabel={typeof reference?.shortName === 'string' ? reference.shortName : 'Rank'}
              addedIds={reconciled?.[selectedPosition].addedIds ?? []}
              onChange={items => updateItems(selectedPosition, items)}
            />
          </>
        )}
      </div>
    </LoadingScreen>
  );
};

export default CustomRankings;

/**
 * Pull the league's scoring type out of its history, preferring the current
 * season and falling back to any season present. Mirrors what MockDraft does
 * inline, minus the repeated `any` casts.
 */
function useScoringType(history: unknown): ScoringType | undefined {
  return useMemo(() => {
    if (!history || typeof history !== 'object') {
      return undefined;
    }
    const seasons = history as Record<string, { scoringType?: ScoringType } | number>;
    const current = seasons[CURRENT_SEASON];
    if (current && typeof current !== 'number' && current.scoringType) {
      return current.scoringType;
    }
    const fallback = Object.values(seasons).find(
      (info): info is { scoringType?: ScoringType } => typeof info !== 'number'
    );
    return fallback?.scoringType;
  }, [history]);
}
