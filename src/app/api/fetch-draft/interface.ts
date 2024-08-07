import { Platform } from "@/platforms/common";

export type FetchDraftRequest = {
    platform: Platform;
    leagueID: number;
    season: number;
}

export type FetchDraftResponse = {
    status: 'ok' | string;
    data?: DraftInfo;
}

