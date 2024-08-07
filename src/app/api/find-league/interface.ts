import { Platform } from "@/platforms/common";

export type FindLeagueRequest = {
    platform: Platform;
    leagueID: number;
    swid?: string;
    espnS2?: string;
}

export type FindLeagueResponse = {
    status: 'ok' | string;
}