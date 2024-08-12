import { Platform, PlatformLeague } from "@/platforms/common";

export type FetchLeagueRequest = {
    league: PlatformLeague;
    season: number;
}

export type FetchLeagueResponse = {
    status: 'ok' | string;
    data?: LeagueInfo;
}