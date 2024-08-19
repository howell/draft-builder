import { PlatformLeague } from "@/platforms/common";

export const CURRENT_LEAGUES_SCHEMA_VERSION = 2;

export type StoredLeagues = {
    [leagueID: number]: PlatformLeague;
};

export type StoredLeaguesData = {
    schemaVersion: number;
    leagues: StoredLeagues;
};

