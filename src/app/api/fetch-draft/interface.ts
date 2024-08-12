import { Platform, PlatformLeague } from "@/platforms/common";

export type FetchDraftRequest = {
    league: PlatformLeague;
    season: number;
}

export type FetchDraftResponse = {
    status: 'ok' | string;
    data?: DraftInfo;
}

