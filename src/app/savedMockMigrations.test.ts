import { CostEstimatedPlayer, EstimationSettingsState, EstimationSettingsStateV2, EstimationSettingsStateV4, RosterSelections, SearchSettingsState, StoredDataV2, StoredDataV3, StoredDataV4, StoredDraftDataV3 } from "./savedMockTypes";
import { migrateV2toV3, migrateV3toV4 } from "./savedMockMigrations";

const estimationSettings: EstimationSettingsStateV2 = {
    years: [2022, 2023, 2024],
    weight: 0.6
};

const estimationSettingsV4: EstimationSettingsStateV4 = {
    years: ['2022', '2023', '2024'],
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
describe("migrateV3toV4", () => {
    it("should migrate data from V3 to V4 schema", () => {
        const data: StoredDataV3 = {
            schemaVersion: 3,
            "1": {
                drafts: {
                    draft1: {
                        year: 2024,
                        notes: "this gonna be good",
                        created: 123456,
                        modified: 123457,
                        rosterSelections: {},
                        estimationSettings,
                        searchSettings,
                        costAdjustments: {},
                    },
                    draft2: {
                        year: 2023,
                        notes: "this gonna be better",
                        created: 13456,
                        modified: 13457,
                        rosterSelections: {},
                        estimationSettings,
                        searchSettings,
                        costAdjustments: {},
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
                        costAdjustments: {},
                    },
                },
            },
        };

        const expectedData: StoredDataV4 = {
            schemaVersion: 4,
            mocks: {
                "1": {
                    drafts: {
                        draft1: {
                            ...data[1].drafts.draft1,
                            estimationSettings: estimationSettingsV4,
                            year: "2024",
                        },
                        draft2: {
                            ...data[1].drafts.draft2,
                            estimationSettings: estimationSettingsV4,
                            year: "2023",
                        },
                    },
                },
                "2": {
                    drafts: {
                        draft3: {
                            ...data[2].drafts.draft3,
                            estimationSettings: estimationSettingsV4,
                            year: "2024",
                        },
                    },
                },
            },
        };

        const migratedData = migrateV3toV4(data);
        expect(migratedData).toEqual(expectedData);
    });
});