import { Platform } from "@/app/api/interface";

export type FetchPlayersRequest = {
    platform: Platform;
    leagueID: number;
    season: number;
    scoringPeriodId: number;
    maxPlayers: number;
}

export type FetchPlayersResponse = {
    status: 'ok' | string;
    data?: PlayersInfo;
}


