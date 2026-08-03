import { SeasonId } from '@/platforms/common';

export interface PlayerValuesRequest {
    /** seasons to fetch, e.g. ["2023","2024"] */
    seasons: SeasonId[];
    /**
     * Optional as-of date (YYYY-MM-DD): API-source seasons return the latest
     * snapshot taken on or before this date instead of the latest overall,
     * so archived drafts can be scored against the values of their own day.
     * Draft-kit rows are frozen preseason artifacts and always win regardless.
     */
    asOf?: string;
    /**
     * Which published rank type to serve (default PPR). Superflex/2-QB
     * leagues should ask for SUPERFLEX — QBs are valued on their own column
     * there. Seasons with no rows of the requested type fall back to PPR
     * rather than returning nothing.
     */
    rankType?: RankType;
}

export type RankType = 'PPR' | 'SUPERFLEX';

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
    /** ESPN-wide live auction-market average at snapshot time; null for kit rows and older snapshots */
    marketValue: number | null;
    source: 'draft_kit_pdf' | 'api';
    snapshotDate: string;
}

export interface PlayerValuesResponse {
    status: 'ok' | string;
    /** rows per season; draft-kit values preferred, else the latest API snapshot */
    data?: Record<string, PlatformPlayerValue[]>;
}
