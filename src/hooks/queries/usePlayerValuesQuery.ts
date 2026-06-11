import { useQuery } from '@tanstack/react-query';
import { SeasonId } from '@/platforms/common';
import { PlayerValuesResponse } from '@/app/api/player-values/interface';

/**
 * Platform (ESPN) preseason player values per season, served from our own
 * platform_player_values table. Global reference data — not league-scoped.
 */
export function usePlayerValuesQuery(seasons: SeasonId[]) {
  return useQuery({
    queryKey: ['playerValues', 'espn', ...seasons],
    queryFn: async () => {
      const params = new URLSearchParams({ seasons: JSON.stringify(seasons) });
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
