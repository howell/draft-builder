import { PlatformLeague, SeasonId } from "@/platforms/common";
import { Player } from "@/platforms/PlatformApi";

export type FetchPlayersRequest = {
    league: PlatformLeague;
    season: SeasonId;
    scoringPeriodId: number;
    maxPlayers: number;
}

export type FetchPlayersResponse = {
    status: 'ok' | string;
    data?: Player[];
}


