import { PlatformLeague } from "@/platforms/common";
import { Player } from "@/platforms/PlatformApi";

export type FetchPlayersRequest = {
    league: PlatformLeague;
    season: number;
    scoringPeriodId: number;
    maxPlayers: number;
}

export type FetchPlayersResponse = {
    status: 'ok' | string;
    data?: Player[];
}


