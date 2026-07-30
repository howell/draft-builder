import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/context';
import { useStorageAdapter } from '@/lib/storage/hooks';
import type { LeagueId } from '@/platforms/common';
import type { PlanSelections } from '@/lib/models/live-draft/rosterPlan';
import { cacheKeys } from './cache-keys';

/**
 * A league's "my roster" draft plan for the game-day board: the manual
 * team override (absent = trust the TOKEN-frame auto-detection) and the
 * penciled-in players per slot. Only deltas are stored — planned prices are
 * always the live model estimate plus the delta.
 */
export interface LeagueRosterPlan {
  teamId?: string;
  selections: PlanSelections;
}

/** Map of leagueId -> stored plan. */
export type LeagueRosterPlanMap = Record<LeagueId, LeagueRosterPlan>;

const SETTING_TYPE = 'app' as const;
const SETTING_KEY = 'liveDraftRosterPlans';

/** Read the stored per-league roster plans. Leagues without a plan are absent. */
export function useLeagueRosterPlansQuery() {
  const { user, loading: authLoading } = useAuth();
  const storageAdapter = useStorageAdapter();

  return useQuery<LeagueRosterPlanMap>({
    queryKey: cacheKeys.leagueRosterPlans(user?.id),
    queryFn: async () => {
      const stored = await storageAdapter.getUserSetting<LeagueRosterPlanMap>(
        SETTING_TYPE,
        SETTING_KEY
      );
      return stored ?? {};
    },
    enabled: !authLoading,
    staleTime: 5 * 60 * 1000,
  });
}

interface SavePlanParams {
  leagueId: LeagueId;
  /** New plan, or null to clear the league's plan. */
  plan: LeagueRosterPlan | null;
}

/** Persist one league's roster plan. Passing `null` clears it. */
export function useSaveLeagueRosterPlanMutation() {
  const { user } = useAuth();
  const storageAdapter = useStorageAdapter();
  const queryClient = useQueryClient();
  const queryKey = cacheKeys.leagueRosterPlans(user?.id);

  return useMutation({
    mutationFn: async ({ leagueId, plan }: SavePlanParams) => {
      const current =
        (await storageAdapter.getUserSetting<LeagueRosterPlanMap>(SETTING_TYPE, SETTING_KEY)) ?? {};
      const next: LeagueRosterPlanMap = { ...current };

      if (plan == null) {
        delete next[leagueId];
      } else {
        next[leagueId] = plan;
      }

      await storageAdapter.setUserSetting(SETTING_TYPE, SETTING_KEY, next);
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(queryKey, next);
    },
    onError: (error) => {
      console.error('[useSaveLeagueRosterPlanMutation] Save failed:', error);
    },
  });
}
