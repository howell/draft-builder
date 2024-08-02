import * as regression from 'regression'

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
    [leagueId: number] : { drafts: { [draftName: string]: RosterSelections } }
}
