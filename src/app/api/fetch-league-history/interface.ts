import { Platform } from "@/app/api/interface";

export type FetchLeagueHistoryRequest = {
    platform: Platform;
    leagueID: number;
    startSeason: number;
}

export type FetchLeagueHistoryResponse = {
    status: 'ok' | string;
    data?: { [key: number]: LeagueInfo; };
}
