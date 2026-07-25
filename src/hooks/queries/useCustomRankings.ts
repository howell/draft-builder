import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { useStorageAdapter } from '@/lib/storage/hooks';
import type { LeagueId, Platform, SeasonId } from '@/platforms/common';
import {
  CUSTOM_RANKINGS_SCHEMA_VERSION,
  type CustomRankingItem,
  type RankablePosition,
  type StoredCustomRankings,
} from '@/types/customRankings';
import { cacheKeys } from './cache-keys';

/**
 * Custom rankings ride the generic `user_settings` blob rather than a dedicated
 * table, which keeps this feature clear of the StorageAdapter interface, all
 * four adapters, the Dexie schema, and a SQL migration.
 *
 * One key per league rather than a single map of every league: a board is
 * ~250 ids per position and autosaves on every edit, so a shared blob would
 * rewrite every league's data on each keystroke-scale change and invite
 * read-modify-write clobbering across tabs.
 */
const SETTING_TYPE = 'app' as const;

export function customRankingsKey(leagueId: LeagueId): string {
  return `customRankings:${leagueId}`;
}

export function useCustomRankingsQuery(leagueId: LeagueId | undefined) {
  const { user, loading: authLoading } = useAuth();
  const storageAdapter = useStorageAdapter();

  return useQuery<StoredCustomRankings | null>({
    queryKey: cacheKeys.customRankings(user?.id, leagueId),
    queryFn: async () => {
      const stored = await storageAdapter.getUserSetting<StoredCustomRankings>(
        SETTING_TYPE,
        customRankingsKey(leagueId!)
      );
      return stored ?? null;
    },
    enabled: !!leagueId && !authLoading,
    staleTime: 5 * 60 * 1000,
    // The board holds unsaved edits in local state. A refetch triggered by a tab
    // switch must not race that.
    refetchOnWindowFocus: false,
  });
}

export interface SaveCustomRankingsParams {
  platform: Platform;
  season: SeasonId;
  positions: Partial<Record<RankablePosition, CustomRankingItem[]>>;
  hidePlatformRank?: boolean;
}

export function useSaveCustomRankingsMutation(leagueId: LeagueId) {
  const { user } = useAuth();
  const storageAdapter = useStorageAdapter();
  const queryClient = useQueryClient();
  const queryKey = cacheKeys.customRankings(user?.id, leagueId);

  return useMutation({
    mutationFn: async ({ platform, season, positions, hidePlatformRank }: SaveCustomRankingsParams) => {
      const next: StoredCustomRankings = {
        schemaVersion: CUSTOM_RANKINGS_SCHEMA_VERSION,
        leagueId,
        platform,
        season,
        updated: Date.now(),
        hidePlatformRank,
        positions,
      };

      await storageAdapter.setUserSetting(SETTING_TYPE, customRankingsKey(leagueId), next);
      return next;
    },
    onMutate: async (params) => {
      // Keep the cache in step so a remount mid-edit reads the latest board
      // rather than the last persisted one.
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<StoredCustomRankings | null>(queryKey);
      return { previous };
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
    },
    onError: (error, _params, context) => {
      // Roll the cache back only. The caller keeps its local state so the user's
      // ordering survives a failed save and can be retried.
      if (context) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      console.error('[useSaveCustomRankingsMutation] Save failed:', error);
    },
  });
}

export type CustomRankingsIndexEntry = {
  leagueId: LeagueId;
  platform: Platform;
  season: SeasonId;
  updated: number;
  counts: Partial<Record<RankablePosition, number>>;
};

/**
 * Which of the user's leagues already have a saved board, for the "copy from
 * another league" picker. Keys are per-league so this fans out, but it only runs
 * while the picker is open and leagues number in the handful.
 */
export function useCustomRankingsIndexQuery(leagueIds: LeagueId[], enabled: boolean) {
  const { user, loading: authLoading } = useAuth();
  const storageAdapter = useStorageAdapter();

  return useQuery<CustomRankingsIndexEntry[]>({
    queryKey: [...cacheKeys.customRankingsIndex(user?.id), leagueIds],
    queryFn: async () => {
      const entries = await Promise.all(
        leagueIds.map(async (leagueId) => {
          const stored = await storageAdapter.getUserSetting<StoredCustomRankings>(
            SETTING_TYPE,
            customRankingsKey(leagueId)
          );
          if (!stored) {
            return null;
          }
          const counts: Partial<Record<RankablePosition, number>> = {};
          for (const [position, items] of Object.entries(stored.positions ?? {})) {
            counts[position as RankablePosition] = (items ?? []).filter(i => i.kind === 'player').length;
          }
          return {
            leagueId,
            platform: stored.platform,
            season: stored.season,
            updated: stored.updated,
            counts,
          } satisfies CustomRankingsIndexEntry;
        })
      );

      return entries.filter((e): e is CustomRankingsIndexEntry => e !== null);
    },
    enabled: enabled && !authLoading && leagueIds.length > 0,
    staleTime: 60 * 1000,
  });
}

export class CrossPlatformCopyError extends Error {
  constructor(sourcePlatform: Platform, targetPlatform: Platform) {
    super(
      `Cannot copy rankings from a ${sourcePlatform} league into a ${targetPlatform} league — ` +
      `player IDs are not shared between platforms.`
    );
    this.name = 'CrossPlatformCopyError';
  }
}

/**
 * Clone another league's board onto this one.
 *
 * No merging is needed: reconciliation runs on load, so players the target
 * league does not carry get dropped and its extras get appended in rank order.
 */
export function useCopyCustomRankingsMutation(targetLeagueId: LeagueId, targetPlatform: Platform) {
  const { user } = useAuth();
  const storageAdapter = useStorageAdapter();
  const queryClient = useQueryClient();
  const queryKey = cacheKeys.customRankings(user?.id, targetLeagueId);

  return useMutation({
    mutationFn: async ({ sourceLeagueId }: { sourceLeagueId: LeagueId }) => {
      const source = await storageAdapter.getUserSetting<StoredCustomRankings>(
        SETTING_TYPE,
        customRankingsKey(sourceLeagueId)
      );
      if (!source) {
        throw new Error(`No saved rankings found for league ${sourceLeagueId}`);
      }
      // ESPN and Sleeper ids share no namespace, so copying across platforms
      // would drop every player and silently reset the board to a prefill.
      if (source.platform !== targetPlatform) {
        throw new CrossPlatformCopyError(source.platform, targetPlatform);
      }

      const next: StoredCustomRankings = {
        ...source,
        leagueId: targetLeagueId,
        updated: Date.now(),
      };

      await storageAdapter.setUserSetting(SETTING_TYPE, customRankingsKey(targetLeagueId), next);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
    },
    onError: (error) => {
      console.error('[useCopyCustomRankingsMutation] Copy failed:', error);
    },
  });
}
