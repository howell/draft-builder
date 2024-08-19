import { CostEstimatedPlayer, EstimationSettingsState, RosterSelections, SearchSettingsState, StoredDataV2, StoredDataV3, StoredDraftDataV3 } from "./savedMockTypes";
import migrateV2toV3 from "./savedMockMigrations";

const estimationSettings: EstimationSettingsState = {
    years: [2022, 2023, 2024],
    weight: 0.6
};

const searchSettings: SearchSettingsState = {
    positions: ["QB", "RB", "WR", "TE"],
    minPrice: 0,
    maxPrice: 1000,
    playerCount: 10,
    showOnlyAvailable: true
};

const aPlayer: CostEstimatedPlayer = {
    id: 1,
    name: "Player 1",
    defaultPosition: "RB",
    positions: ["RB"],
    suggestedCost: 100,
    overallRank: 1,
    positionRank: 1,
    estimatedCost: 100,
};

const rosterSelections: RosterSelections = {
    "RB0": aPlayer,
}

describe("migrateV2toV3", () => {
    it("should migrate data from V2 to V3 schema", () => {
        const data: StoredDataV2 = {
            schemaVersion: 2,
            1: {
                drafts: {
                    draft1: {
                        year: 2024,
                        notes: "this gonna be good",
                        created: 123456,
                        modified: 123457,
                        rosterSelections,
                        estimationSettings,
                        searchSettings,
                    },
                    draft2: {
                        year: 2023,
                        notes: "this gonna be better",
                        created: 13456,
                        modified: 13457,
                        rosterSelections: {},
                        estimationSettings,
                        searchSettings,
                    },
                },
            },
            2: {
                drafts: {
                    draft3: {
                        year: 2024,
                        notes: "this gonna be best",
                        created: 1456,
                        modified: 1457,
                        rosterSelections: {},
                        estimationSettings,
                        searchSettings,
                    },
                },
            },
        };

        const expectedData: StoredDataV3 = {
            schemaVersion: 3,
            1: {
                drafts: {
                    draft1: {
                        ...data[1].drafts.draft1,
                        costAdjustments: {},
                    },
                    draft2: {
                        ...data[1].drafts.draft2,
                        costAdjustments: {},
                    },
                },
            },
            2: {
                drafts: {
                    draft3: {
                        ...data[2].drafts.draft3,
                        costAdjustments: {},
                    },
                },
            },
        };

        const migratedData = migrateV2toV3(data);
        expect(migratedData).toEqual(expectedData);
    });
});