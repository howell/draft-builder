import { useQuery } from '@tanstack/react-query';
import { SeasonId } from '@/platforms/common';
import { PlayerValuesResponse, RankType } from '@/app/api/player-values/interface';

/**
 * Platform (ESPN) preseason player values per season, served from our own
 * platform_player_values table. Global reference data — not league-scoped.
 * Pass asOf (YYYY-MM-DD) to pin API-source seasons to the snapshot that was
 * current on that date (e.g. an archived draft's day) instead of the latest.
 * Pass rankType 'SUPERFLEX' for superflex/2-QB leagues — QBs are valued on
 * their own column there (seasons without SUPERFLEX rows fall back to PPR).
 */
export function usePlayerValuesQuery(seasons: SeasonId[], asOf?: string, rankType?: RankType) {
  return useQuery({
    queryKey: ['playerValues', 'espn', asOf ?? 'latest', rankType ?? 'PPR', ...seasons],
    queryFn: async () => {
      const params = new URLSearchParams({ seasons: JSON.stringify(seasons) });
      if (asOf) params.set('asOf', JSON.stringify(asOf));
      if (rankType) params.set('rankType', JSON.stringify(rankType));
      const res = await fetch(`/api/player-values?${params.toString()}`);
      const body: PlayerValuesResponse = await res.json();
      if (!res.ok || body.status !== 'ok' || !body.data) {
        throw new Error(`Failed to load player values: ${body.status}`);
      }
      return body.data;
    },
    staleTime: 24 * 60 * 60 * 1000, // historical values change at most daily
    enabled: seasons.length > 0,
  });
}
