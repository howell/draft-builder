import { CURRENT_LEAGUES_SCHEMA_VERSION } from '../constants';
import {
  StoredLeaguesDataV2,
  StoredLeaguesDataV3,
  StoredLeaguesDataCurrent
} from '@/types/storage';

// Re-export types for use in other modules
export type {
  StoredLeaguesDataV2,
  StoredLeaguesDataV3,
  StoredLeaguesDataCurrent
} from '@/types/storage';

/**
 * Migrates league data to the current schema version
 * @param data - Raw data from storage
 * @returns Migrated data or undefined if migration fails
 */
export default function migrateLeagues(data: any): StoredLeaguesDataCurrent | undefined {
  while (data && data?.schemaVersion !== CURRENT_LEAGUES_SCHEMA_VERSION) {
    switch (data?.schemaVersion) {
      case 2:
        data = migrateV2toV3(data);
        continue;
      default:
        data = undefined;
    }
  }
  return data;
}

/**
 * Migrates league data from version 2 to version 3
 * @param data - V2 league data
 * @returns V3 league data
 */
export function migrateV2toV3(data: StoredLeaguesDataV2): StoredLeaguesDataV3 {
  const leagues: StoredLeaguesDataV3["leagues"] = {};
  for (const leagueKey in data.leagues) {
    leagues[leagueKey] = data.leagues[leagueKey];
    leagues[leagueKey].id = leagueKey;
  }
  return {
    schemaVersion: 3,
    leagues: leagues,
  };
} 