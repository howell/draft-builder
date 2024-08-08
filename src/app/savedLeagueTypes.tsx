import { PlatformLeague } from "@/platforms/common";

export const CURRENT_SCHEMA_VERSION = 0;

export type StoredLeagues = {
    [leagueID: number]: PlatformLeague;
};

export type StoredLeaguesData = {
    schemaVersion: number;
    leagues: StoredLeagues;
};

