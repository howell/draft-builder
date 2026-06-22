import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { useStorageAdapter } from '@/lib/storage/hooks';
import type { LeagueId } from '@/platforms/common';
import { cacheKeys } from './cache-keys';

/** Map of leagueId -> stored ESPN price multiplier override. */
export type LeaguePriceMultipliers = Record<LeagueId, number>;

const SETTING_TYPE = 'app' as const;
const SETTING_KEY = 'leaguePriceMultipliers';

/**
 * Read the user's stored per-league price multiplier overrides. Returns a map of
 * leagueId -> multiplier; leagues without an explicit override are absent (callers
 * fall back to `defaultPriceMultiplier`). See `src/lib/leaguePriceMultiplier.ts`.
 */
export function useLeaguePriceMultipliersQuery() {
  const { user, loading: authLoading } = useAuth();
  const storageAdapter = useStorageAdapter();

  return useQuery<LeaguePriceMultipliers>({
    queryKey: cacheKeys.leaguePriceMultipliers(user?.id),
    queryFn: async () => {
      const stored = await storageAdapter.getUserSetting<LeaguePriceMultipliers>(
        SETTING_TYPE,
        SETTING_KEY
      );
      return stored ?? {};
    },
    enabled: !authLoading,
    staleTime: 5 * 60 * 1000,
  });
}

interface SetMultiplierParams {
  leagueId: LeagueId;
  /** New override, or null/undefined to clear it (revert to the computed default). */
  multiplier: number | null;
}

/**
 * Persist a single league's multiplier override. Passing `null` clears the
 * override so the league reverts to its computed default.
 */
export function useSaveLeaguePriceMultiplierMutation() {
  const { user } = useAuth();
  const storageAdapter = useStorageAdapter();
  const queryClient = useQueryClient();
  const queryKey = cacheKeys.leaguePriceMultipliers(user?.id);

  return useMutation({
    mutationFn: async ({ leagueId, multiplier }: SetMultiplierParams) => {
      const current =
        (await storageAdapter.getUserSetting<LeaguePriceMultipliers>(SETTING_TYPE, SETTING_KEY)) ?? {};
      const next: LeaguePriceMultipliers = { ...current };

      if (multiplier == null) {
        delete next[leagueId];
      } else {
        next[leagueId] = multiplier;
      }

      await storageAdapter.setUserSetting(SETTING_TYPE, SETTING_KEY, next);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
    },
    onError: (error) => {
      console.error('[useSaveLeaguePriceMultiplierMutation] Save failed:', error);
    },
  });
}
