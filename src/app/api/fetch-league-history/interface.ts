import { PlatformLeague } from "@/platforms/common";
import { LeagueInfo } from "@/platforms/PlatformApi";

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
