import { PlatformLeague } from "@/platforms/common";

export type FetchLeagueHistoryRequest = {
    league: PlatformLeague;
    startSeason: number;
}

export type LeagueInfoHistory = {
    [ key: number ]: LeagueInfo;
}

export type FetchLeagueHistoryResponse = {
    status: 'ok' | string;
    data?: LeagueInfoHistory;
}
