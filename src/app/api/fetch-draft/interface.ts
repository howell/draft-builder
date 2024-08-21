import { PlatformLeague } from "@/platforms/common";
import { DraftDetail } from "@/platforms/PlatformApi";

export type FetchDraftRequest = {
    league: PlatformLeague;
    season: number;
}

export type FetchDraftResponse = {
    status: 'ok' | string;
    data?: DraftDetail;
}

