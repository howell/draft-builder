import { PlatformLeague, SeasonId } from "@/platforms/common";
import { DraftDetail } from "@/platforms/PlatformApi";

export type FetchDraftRequest = {
    league: PlatformLeague;
    season: SeasonId;
}

export type FetchDraftResponse = {
    status: 'ok' | string;
    data?: DraftDetail;
}

