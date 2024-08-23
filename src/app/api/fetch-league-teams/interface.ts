import { PlatformLeague, SeasonId } from "@/platforms/common";
import { LeagueTeam } from "@/platforms/PlatformApi";

export type FetchLeagueTeamsRequest = {
    league: PlatformLeague;
    season: SeasonId;
    scoringPeriodId: number;
}

export type FetchLeagueTeamsResponse = {
    status: 'ok' | string;
    data?: LeagueTeam[];
}



