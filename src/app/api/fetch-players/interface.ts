import { Platform, PlatformLeague } from "@/platforms/common";

export type FetchPlayersRequest = {
    league: PlatformLeague;
    season: number;
    scoringPeriodId: number;
    maxPlayers: number;
}

export type FetchPlayersResponse = {
    status: 'ok' | string;
    data?: PlayersInfo;
}


