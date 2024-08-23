import { PlatformLeague, SeasonId } from "@/platforms/common";
import { LeagueInfo } from "@/platforms/PlatformApi";

export type FetchLeagueRequest = {
    league: PlatformLeague;
    season: SeasonId;
}

export type FetchLeagueResponse = {
    status: 'ok' | string;
    data?: LeagueInfo;
}