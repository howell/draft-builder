export const CURRENT_SCHEMA_VERSION = 2;

export type Rankings = {
    overall: Map<number, number>,
    positional: Map<number, Map<number, number>>
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
    suggestedCost: number,
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

export type StoredData = {
    schemaVersion: number;
    [leagueId: number] : StoredMocksData
}

export type StoredMocksData = {
    drafts: { [draftName: string]: StoredDraftData }
}

export type StoredDraftData = {
    rosterSelections: RosterSelections;
    estimationSettings: EstimationSettingsState;
    searchSettings: SearchSettingsState;
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

