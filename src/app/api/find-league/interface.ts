import { PlatformLeague } from "@/platforms/common";

export type FindLeagueRequest = {
    league: PlatformLeague;
}

export type FindLeagueResponse = {
    status: 'ok' | string;
}