import { Platform } from "@/platforms/common";

export type FetchLeagueRequest = {
    platform: Platform;
    leagueID: number;
    season: number;
}

export type FetchLeagueResponse = {
    status: 'ok' | string;
    data?: LeagueInfo;
}