import { Platform } from "@/app/api/interface";

export type FetchDraftRequest = {
    platform: Platform;
    leagueID: number;
    season: number;
}

export type FetchDraftResponse = {
    status: 'ok' | string;
    data?: DraftInfo;
}

