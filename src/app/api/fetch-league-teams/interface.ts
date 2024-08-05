import { Platform } from "@/app/api/interface";

export type FetchLeagueTeamsRequest = {
    platform: Platform;
    leagueID: number;
    season: number;
    scoringPeriodId: number;
}

export type FetchLeagueTeamsResponse = {
    status: 'ok' | string;
    data?: TeamInfo;
}



