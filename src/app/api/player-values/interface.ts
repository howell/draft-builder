import { SeasonId } from '@/platforms/common';

export interface PlayerValuesRequest {
    /** seasons to fetch, e.g. ["2023","2024"] */
    seasons: SeasonId[];
}

/** One player's platform valuation for a season (ESPN 10-team/$200 baseline). */
export interface PlatformPlayerValue {
    playerId: string | null;
    playerName: string;
    position: string;
    /** 1-indexed as published */
    overallRank: number | null;
    /** 1-indexed as published */
    positionRank: number | null;
    auctionValue: number | null;
    source: 'draft_kit_pdf' | 'api';
    snapshotDate: string;
}

export interface PlayerValuesResponse {
    status: 'ok' | string;
    /** rows per season; draft-kit values preferred, else the latest API snapshot */
    data?: Record<string, PlatformPlayerValue[]>;
}
