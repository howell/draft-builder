import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { useStorageAdapter } from '@/lib/storage/hooks';
import type { StorageAdapter } from '@/lib/storage/interface';
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
 * One key per league *and season*: player pools turn over every year, so a board
 * built for one season is a starting point for the next rather than the same
 * artifact carried forward invisibly. Season-scoping is what makes "import last
 * season's board" a real choice instead of an implicit mutation.
 *
 * A single shared blob across leagues was rejected: a board is ~250 ids per
 * position and the page autosaves on every edit, so one blob would rewrite every
 * league's data on each change and invite read-modify-write clobbering between
 * tabs.
 */
const SETTING_TYPE = 'app' as const;

export function customRankingsKey(leagueId: LeagueId, season: SeasonId): string {
  return `customRankings:${leagueId}:${season}`;
}

/**
 * The key used before boards were season-scoped.
 *
 * Compatibility shim. That version shipped to production, so real browsers hold
 * boards under this key; without a fallback they are simply unreachable. The
 * blob itself already recorded its season, which is what makes adopting one
 * safe. Removable once the 2026 rollover has passed.
 */
export function legacyCustomRankingsKey(leagueId: LeagueId): string {
  return `customRankings:${leagueId}`;
}

function hasAnyPlayers(board: StoredCustomRankings): boolean {
  return Object.values(board.positions ?? {}).some(
    items => (items ?? []).some(item => item.kind === 'player')
  );
}

/**
 * Read a board, falling back to the pre-season-scoping key and adopting it.
 *
 * A plain function rather than inline in the queryFn so it is testable without
 * React and reusable by the import picker. Deliberately not in
 * `src/lib/rankings/customRankings.ts`, which is kept free of storage concerns.
 */
export async function loadCustomRankings(
  adapter: Pick<StorageAdapter, 'getUserSetting' | 'setUserSetting'>,
  leagueId: LeagueId,
  season: SeasonId,
  options: { adopt?: boolean } = {}
): Promise<StoredCustomRankings | null> {
  const scoped = await adapter.getUserSetting<StoredCustomRankings>(
    SETTING_TYPE,
    customRankingsKey(leagueId, season)
  );
  // The common path costs exactly one read; the fallback below is unreachable
  // once a board has been saved under the scoped key.
  if (scoped) {
    return scoped;
  }

  const legacy = await adapter.getUserSetting<StoredCustomRankings>(
    SETTING_TYPE,
    legacyCustomRankingsKey(leagueId)
  );
  if (!legacy) {
    return null;
  }

  // The season check is load-bearing. Without it, every league would silently
  // inherit last year's board on rollover — exactly the implicit carry-forward
  // that season-scoping was introduced to stop.
  if (legacy.season !== season || legacy.leagueId !== leagueId || !hasAnyPlayers(legacy)) {
    return null;
  }

  if (options.adopt !== false) {
    try {
      await adapter.setUserSetting(SETTING_TYPE, customRankingsKey(leagueId, season), legacy);
    } catch (error) {
      // A failed adoption must never fail the read. The page's autosave will
      // persist it on the first edit, and the next visit retries.
      console.error('[useCustomRankings] Could not adopt legacy board:', error);
    }
  }

  return legacy;
}

export function useCustomRankingsQuery(leagueId: LeagueId | undefined, season: SeasonId) {
  const { user, loading: authLoading } = useAuth();
  const storageAdapter = useStorageAdapter();

  return useQuery<StoredCustomRankings | null>({
    queryKey: cacheKeys.customRankings(user?.id, leagueId, season),
    queryFn: () => loadCustomRankings(storageAdapter, leagueId!, season),
    enabled: !!leagueId && !authLoading,
    staleTime: 5 * 60 * 1000,
    // The board holds unsaved edits in local state. A refetch triggered by a tab
    // switch must not race that.
    refetchOnWindowFocus: false,
  });
}

export interface SaveCustomRankingsParams {
  platform: Platform;
  positions: Partial<Record<RankablePosition, CustomRankingItem[]>>;
  hidePlatformRank?: boolean;
}

export function useSaveCustomRankingsMutation(leagueId: LeagueId, season: SeasonId) {
  const { user } = useAuth();
  const storageAdapter = useStorageAdapter();
  const queryClient = useQueryClient();
  const queryKey = cacheKeys.customRankings(user?.id, leagueId, season);

  return useMutation({
    mutationFn: async ({ platform, positions, hidePlatformRank }: SaveCustomRankingsParams) => {
      const next: StoredCustomRankings = {
        schemaVersion: CUSTOM_RANKINGS_SCHEMA_VERSION,
        leagueId,
        platform,
        season,
        updated: Date.now(),
        hidePlatformRank,
        positions,
      };

      await storageAdapter.setUserSetting(SETTING_TYPE, customRankingsKey(leagueId, season), next);
      return next;
    },
    onMutate: async () => {
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

/** One saved board the user could import from. */
export type CustomRankingsSource = {
  leagueId: LeagueId;
  season: SeasonId;
  platform: Platform;
  updated: number;
  counts: Partial<Record<RankablePosition, number>>;
  totalPlayers: number;
};

/**
 * Every saved board across the given leagues and seasons, for the import picker.
 *
 * The storage abstraction exposes no key enumeration, so this probes each
 * league × season pair. That is bounded and cheap — a handful of leagues over a
 * short season window — and only runs while the picker is open.
 */
export function useCustomRankingsIndexQuery(
  leagueIds: LeagueId[],
  seasons: SeasonId[],
  enabled: boolean
) {
  const { user, loading: authLoading } = useAuth();
  const storageAdapter = useStorageAdapter();

  return useQuery<CustomRankingsSource[]>({
    queryKey: [...cacheKeys.customRankingsIndex(user?.id), leagueIds, seasons],
    queryFn: async () => {
      const pairs = leagueIds.flatMap(leagueId =>
        seasons.map(season => ({ leagueId, season }))
      );

      const entries = await Promise.all(
        pairs.map(async ({ leagueId, season }) => {
          const stored = await storageAdapter.getUserSetting<StoredCustomRankings>(
            SETTING_TYPE,
            customRankingsKey(leagueId, season)
          );
          if (!stored) {
            return null;
          }

          const counts: Partial<Record<RankablePosition, number>> = {};
          let totalPlayers = 0;
          for (const [position, items] of Object.entries(stored.positions ?? {})) {
            const playerCount = (items ?? []).filter(i => i.kind === 'player').length;
            counts[position as RankablePosition] = playerCount;
            totalPlayers += playerCount;
          }

          return {
            leagueId,
            season,
            platform: stored.platform,
            updated: stored.updated,
            counts,
            totalPlayers,
          } satisfies CustomRankingsSource;
        })
      );

      return entries
        .filter((e): e is CustomRankingsSource => e !== null)
        // Most recently edited first — the likeliest thing to want to import.
        .sort((a, b) => b.updated - a.updated);
    },
    enabled: enabled && !authLoading && leagueIds.length > 0 && seasons.length > 0,
    staleTime: 60 * 1000,
  });
}

export class CrossPlatformCopyError extends Error {
  constructor(sourcePlatform: Platform, targetPlatform: Platform) {
    super(
      `Cannot import rankings from a ${sourcePlatform} league into a ${targetPlatform} league — ` +
      `player IDs are not shared between platforms.`
    );
    this.name = 'CrossPlatformCopyError';
  }
}

export interface ImportRankingsParams {
  sourceLeagueId: LeagueId;
  sourceSeason: SeasonId;
}

/**
 * Clone another saved board — a different league, an earlier season, or both —
 * onto this one.
 *
 * No merging is needed: reconciliation runs on load, so players the target pool
 * does not carry get dropped and its extras get appended in rank order. That is
 * exactly what makes importing across seasons work, since rosters turn over.
 */
export function useImportCustomRankingsMutation(
  targetLeagueId: LeagueId,
  targetSeason: SeasonId,
  targetPlatform: Platform
) {
  const { user } = useAuth();
  const storageAdapter = useStorageAdapter();
  const queryClient = useQueryClient();
  const queryKey = cacheKeys.customRankings(user?.id, targetLeagueId, targetSeason);

  return useMutation({
    mutationFn: async ({ sourceLeagueId, sourceSeason }: ImportRankingsParams) => {
      const source = await storageAdapter.getUserSetting<StoredCustomRankings>(
        SETTING_TYPE,
        customRankingsKey(sourceLeagueId, sourceSeason)
      );
      if (!source) {
        throw new Error(
          `No saved rankings found for league ${sourceLeagueId}, season ${sourceSeason}`
        );
      }
      // ESPN and Sleeper ids share no namespace, so importing across platforms
      // would drop every player and silently reset the board to a prefill.
      if (source.platform !== targetPlatform) {
        throw new CrossPlatformCopyError(source.platform, targetPlatform);
      }

      const next: StoredCustomRankings = {
        ...source,
        leagueId: targetLeagueId,
        season: targetSeason,
        updated: Date.now(),
      };

      await storageAdapter.setUserSetting(
        SETTING_TYPE,
        customRankingsKey(targetLeagueId, targetSeason),
        next
      );
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
    },
    onError: (error) => {
      console.error('[useImportCustomRankingsMutation] Import failed:', error);
    },
  });
}
