import { LeagueId, Platform, SeasonId } from "@/platforms/common";
import { Titled } from "@/ui/basicComponents";

export const CURRENT_MOCKS_SCHEMA_VERSION = 4;

export type StoredDataCurrent = StoredDataV4;
export type StoredMocksDataCurrent = StoredMocksDataV4;
export type StoredDraftDataCurrent = StoredDraftDataV4;

export type StoredData =  StoredDataV2 | StoredDataV3 | StoredDataV4;

export type StoredDataV4 = {
    schemaVersion: 4;
    mocks: StoredMocksDataV4;
};

export type StoredDataV3 = {
    schemaVersion: 3;
    [leagueId: number] : StoredMocksDataV3
};

export type StoredMocksDataV4 = {
     [draftName: string]: StoredDraftDataV4
};

export type StoredMocksDataV3 = {
    drafts: { [draftName: string]: StoredDraftDataV3 }
};

export type StoredDraftDataV4 = {
    year: SeasonId;
    notes: string;
    created: number;
    modified: number;
    rosterSelections: RosterSelections;
    estimationSettings: EstimationSettingsStateV4;
    searchSettings: SearchSettingsState;
    costAdjustments: Record<string, number>;
}

export type StoredDraftDataV3 = StoredDraftDataV2 & {
    costAdjustments: Record<string, number>;
}

export type StoredDataV2 = {
    schemaVersion: 2;
    [leagueId: number] : StoredMocksDataV2
}

export type StoredMocksDataV2 = {
    drafts: { [draftName: string]: StoredDraftDataV2 }
}

export type StoredDraftDataV2 = {
    year: number;
    notes: string;
    created: number;
    modified: number;
    rosterSelections: RosterSelections;
    estimationSettings: EstimationSettingsStateV2;
    searchSettings: SearchSettingsState;
}


export type Rankings = {
    platform: Platform;
    overall: Map<string, number>, // playerId -> rank
    positional: Map<string, Map<string, number>> // position -> playerId -> rank
}

export type ExponentialCoefficients = [number, number];

export type DraftAnalysis = {
    overall: ExponentialCoefficients;
    positions: Map<string, ExponentialCoefficients>;
}

export type MockPlayer = MockPlayerV4;

export type MockPlayerV4 = {
    id: string;
    name: string;
    defaultPosition: string;
    positions: string[];
    suggestedCost?: number,
}

export type MockPlayerV2 = {
    id: number;
    name: string;
    defaultPosition: string;
    positions: string[];
    suggestedCost?: number,
    overallRank: number;
    positionRank: number;
}

export type Rank = {
    overallRank: number;
    positionRank: number;
}

export type RankedPlayer = MockPlayer & Rank;

export type CostEstimatedPlayer = RankedPlayer & { estimatedCost: number };

export type RosterSlot = {
    position: string;
    index: number;
};

export type RosterSelections = {
    [key: string]: CostEstimatedPlayer | undefined;
}

export type SearchSettingsState = {
    positions: string[];
    playerCount: number;
    minPrice: number;
    maxPrice: number;
    showOnlyAvailable: boolean;
};

export type EstimationSettingsState = EstimationSettingsStateV4;

export type EstimationSettingsStateV4 = {
    years: SeasonId[];
    weight: number;
};

export type EstimationSettingsStateV2 = {
    years: number[];
    weight: number;
};
export type Ranking = Titled<Rankings>;
