import { PlatformLeague } from "@/platforms/common";
import { LeagueTeam } from "@/platforms/PlatformApi";

export type FetchLeagueTeamsRequest = {
    league: PlatformLeague;
    season: number;
    scoringPeriodId: number;
}

export type FetchLeagueTeamsResponse = {
    status: 'ok' | string;
    data?: LeagueTeam[];
}



