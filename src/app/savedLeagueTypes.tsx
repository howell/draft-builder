import { LeagueId, PlatformLeague } from "@/platforms/common";

export const CURRENT_LEAGUES_SCHEMA_VERSION = 3;

export type StoredLeaguesDataCurrent = StoredLeaguesDataV3 & { schemaVersion: typeof CURRENT_LEAGUES_SCHEMA_VERSION };

export type StoredLeaguesData = StoredLeaguesDataV2 | StoredLeaguesDataV3;

export type StoredLeaguesDataV3 = {
    schemaVersion: 3;
    leagues: { [leagueId: LeagueId]: PlatformLeague }
}

export type StoredLeaguesV2 = {
    [leagueID: number]: PlatformLeague;
};

export type StoredLeaguesDataV2 = {
    schemaVersion: 2;
    leagues: StoredLeaguesV2;
};

