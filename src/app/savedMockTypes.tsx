export const CURRENT_MOCKS_SCHEMA_VERSION = 3;

export type StoredDataCurrent = StoredDataV3;
export type StoredMocksDataCurrent = StoredMocksDataV3;
export type StoredDraftDataCurrent = StoredDraftDataV3;

export type StoredData =  StoredDataV2 | StoredDataV3;

export type StoredDataV3 = {
    schemaVersion: 3;
    [leagueId: number] : StoredMocksDataV3
}

export type StoredMocksDataV3 = {
    drafts: { [draftName: string]: StoredDraftDataV3 }
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
    estimationSettings: EstimationSettingsState;
    searchSettings: SearchSettingsState;
}


export type Rankings = {
    overall: Map<number, number>, // playerId -> rank
    positional: Map<string, Map<number, number>> // position -> playerId -> rank
}

export type ExponentialCoefficients = [number, number];

export type DraftAnalysis = {
    overall: ExponentialCoefficients;
    positions: Map<string, ExponentialCoefficients>;
}

export type MockPlayer = {
    id: number;
    name: string;
    defaultPosition: string;
    positions: string[];
    suggestedCost?: number,
    overallRank: number;
    positionRank: number;
}

export type CostEstimatedPlayer = MockPlayer & { estimatedCost: number };

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

export type EstimationSettingsState = {
    years: number[];
    weight: number;
};

