import { PlatformLeague } from "@/platforms/common";

export type FetchLeagueTeamsRequest = {
    league: PlatformLeague;
    season: number;
    scoringPeriodId: number;
}

export type FetchLeagueTeamsResponse = {
    status: 'ok' | string;
    data?: TeamInfo;
}



