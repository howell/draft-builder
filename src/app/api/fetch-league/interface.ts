import { PlatformLeague } from "@/platforms/common";
import { LeagueInfo } from "@/platforms/PlatformApi";

export type FetchLeagueRequest = {
    league: PlatformLeague;
    season: number;
}

export type FetchLeagueResponse = {
    status: 'ok' | string;
    data?: LeagueInfo;
}