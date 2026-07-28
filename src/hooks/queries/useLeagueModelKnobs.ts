import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { useStorageAdapter } from '@/lib/storage/hooks';
import type { LeagueId } from '@/platforms/common';
import { cacheKeys } from './cache-keys';

/**
 * The calibrated inflation-model settings for a league, written by the
 * simulator's "Calibrate model" button and read by the game-day live-draft
 * board. `config` records the CalibrationConfig the knobs were tuned under —
 * elasticity/blend are only meaningful alongside the same knob flags.
 */
export interface LeagueModelKnobs {
  elasticity: number;
  blend: number;
  /** ISO timestamp of the calibration run */
  calibratedAt: string;
  /** history seasons that fed the calibration */
  seasons?: string[];
  config?: {
    positionalValues: boolean;
    usePriors: boolean;
    useExpectedUnspent: boolean;
  };
}

/** Map of leagueId -> calibrated knobs. */
export type LeagueModelKnobsMap = Record<LeagueId, LeagueModelKnobs>;

const SETTING_TYPE = 'app' as const;
const SETTING_KEY = 'leagueModelKnobs';

/**
 * Read the stored per-league calibrated model knobs. Leagues that have never
 * been calibrated are absent; callers fall back to the plain identity
 * (elasticity 0, blend 1) and surface an "uncalibrated" state.
 */
export function useLeagueModelKnobsQuery() {
  const { user, loading: authLoading } = useAuth();
  const storageAdapter = useStorageAdapter();

  return useQuery<LeagueModelKnobsMap>({
    queryKey: cacheKeys.leagueModelKnobs(user?.id),
    queryFn: async () => {
      const stored = await storageAdapter.getUserSetting<LeagueModelKnobsMap>(
        SETTING_TYPE,
        SETTING_KEY
      );
      return stored ?? {};
    },
    enabled: !authLoading,
    staleTime: 5 * 60 * 1000,
  });
}

interface SaveKnobsParams {
  leagueId: LeagueId;
  /** New knobs, or null to clear the league's calibration. */
  knobs: LeagueModelKnobs | null;
}

/** Persist one league's calibrated knobs. Passing `null` clears them. */
export function useSaveLeagueModelKnobsMutation() {
  const { user } = useAuth();
  const storageAdapter = useStorageAdapter();
  const queryClient = useQueryClient();
  const queryKey = cacheKeys.leagueModelKnobs(user?.id);

  return useMutation({
    mutationFn: async ({ leagueId, knobs }: SaveKnobsParams) => {
      const current =
        (await storageAdapter.getUserSetting<LeagueModelKnobsMap>(SETTING_TYPE, SETTING_KEY)) ?? {};
      const next: LeagueModelKnobsMap = { ...current };

      if (knobs == null) {
        delete next[leagueId];
      } else {
        next[leagueId] = knobs;
      }

      await storageAdapter.setUserSetting(SETTING_TYPE, SETTING_KEY, next);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
    },
    onError: (error) => {
      console.error('[useSaveLeagueModelKnobsMutation] Save failed:', error);
    },
  });
}
