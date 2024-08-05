import { Platform } from "@/app/api/interface";

export type FetchLeagueRequest = {
    platform: Platform;
    leagueID: number;
    season: number;
}

export type FetchLeagueResponse = {
    status: 'ok' | string;
    data?: LeagueInfo;
}