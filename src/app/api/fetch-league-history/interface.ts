import { PlatformLeague, SeasonId } from "@/platforms/common";
import { LeagueInfo } from "@/platforms/PlatformApi";

export type FetchLeagueHistoryRequest = {
    league: PlatformLeague;
    startSeason: SeasonId;
}

export type LeagueInfoHistory = {
    [ key: SeasonId ]: LeagueInfo;
}

export type FetchLeagueHistoryResponse = {
    status: 'ok' | string;
    data?: LeagueInfoHistory;
}
