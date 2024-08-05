import { Platform } from "@/app/api/interface";

export type FetchLeagueHistoryRequest = {
    platform: Platform;
    leagueID: number;
    startSeason: number;
}

export type LeagueInfoHistory = {
    [ key: number ]: LeagueInfo;
}

export type FetchLeagueHistoryResponse = {
    status: 'ok' | string;
    data?: LeagueInfoHistory;
}
