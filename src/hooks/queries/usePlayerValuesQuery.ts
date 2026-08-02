import { useQuery } from '@tanstack/react-query';
import { SeasonId } from '@/platforms/common';
import { PlayerValuesResponse } from '@/app/api/player-values/interface';

/**
 * Platform (ESPN) preseason player values per season, served from our own
 * platform_player_values table. Global reference data — not league-scoped.
 * Pass asOf (YYYY-MM-DD) to pin API-source seasons to the snapshot that was
 * current on that date (e.g. an archived draft's day) instead of the latest.
 */
export function usePlayerValuesQuery(seasons: SeasonId[], asOf?: string) {
  return useQuery({
    queryKey: ['playerValues', 'espn', asOf ?? 'latest', ...seasons],
    queryFn: async () => {
      const params = new URLSearchParams({ seasons: JSON.stringify(seasons) });
      if (asOf) params.set('asOf', JSON.stringify(asOf));
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
