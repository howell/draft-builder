import { CostEstimatedPlayer, EstimationSettingsState, EstimationSettingsStateV2, EstimationSettingsStateV4, MockPlayerV2, RosterSelections, SearchSettingsState, StoredDataCurrent, StoredDataV2, StoredDataV3, StoredDataV4, StoredDraftDataV3 } from "./savedMockTypes";
import migrate, { migrateV2toV3, migrateV3toV4 } from "./savedMockMigrations";
import { readFileSync } from "fs";

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

const aPlayerV2: MockPlayerV2 & {estimatedCost: number} = {
    id: 1,
    name: "Player 1",
    defaultPosition: "RB",
    positions: ["RB"],
    suggestedCost: 100,
    overallRank: 1,
    positionRank: 1,
    estimatedCost: 100,
};

const aPlayerV4: CostEstimatedPlayer = {
    ...aPlayerV2,
    id: '1'
};

const rosterSelectionsV2: any = {
    "RB0": aPlayerV2,
}

const rosterSelectionsV4: RosterSelections = {
    "RB0": aPlayerV4,
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
                        rosterSelections: rosterSelectionsV2,
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
                        rosterSelections: rosterSelectionsV2,
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
                draft1: {
                    ...data[1].drafts.draft1,
                    estimationSettings: estimationSettingsV4,
                    year: "2024",
                },
                draft2: {
                    ...data[1].drafts.draft2,
                    estimationSettings: estimationSettingsV4,
                    rosterSelections: rosterSelectionsV4,
                    year: "2023",
                },
                draft3: {
                    ...data[2].drafts.draft3,
                    estimationSettings: estimationSettingsV4,
                    year: "2024",
                },
            },
        };

        const migratedData = migrateV3toV4(data);
        expect(migratedData).toEqual(expectedData);
    });
});

describe("migrate production v3 data to v4", () => {

    it("should migrate production v3 data to v4 -- case 1", () => {
        const rawData = readFileSync('src/app/tests/v3-mock-data.json', 'utf-8')
        const data: StoredDataV3 = JSON.parse(rawData);
        expect(data?.schemaVersion).toBe(3);
        let migratedData = migrate(data);
        expect(migratedData).toBeDefined();
        migratedData = migratedData as StoredDataCurrent;
        expect(migratedData.schemaVersion).toBe(4);
        expect(migratedData.mocks).toBeDefined();
        expect(migratedData.mocks["##IN_PROGRESS_SELECTIONS##"]).toBeDefined();
        expect(migratedData.mocks["##IN_PROGRESS_SELECTIONS##"].year).toBe("2024");
        expect(migratedData.mocks["##IN_PROGRESS_SELECTIONS##"].rosterSelections).toBeDefined();
        expect(migratedData.mocks["##IN_PROGRESS_SELECTIONS##"].rosterSelections["{\"position\":\"WR\",\"index\":0}"]).toBeDefined();
        expect(migratedData.mocks["Ball hogs"]).toBeDefined();
        expect(migratedData.mocks["Ball hogs"].year).toBe("2024");
        expect(migratedData.mocks["Ball hogs"].rosterSelections).toBeDefined();
        expect(migratedData.mocks["Ball hogs"].rosterSelections["{\"position\":\"WR\",\"index\":0}"]).toBeDefined();
        expect(migratedData.mocks["Ball hogs"].costAdjustments).toBeDefined();
        expect(migratedData.mocks["Ball hogs"].costAdjustments).toEqual({});
    });

    it("should migrate production v3 data to v4 -- case 2", () => {
        const rawData = readFileSync('src/app/tests/v3-mock-data2.json', 'utf-8')
        const data: StoredDataV3 = JSON.parse(rawData);
        expect(data?.schemaVersion).toBe(3);
        let migratedData = migrate(data);
        expect(migratedData).toBeDefined();
        migratedData = migratedData as StoredDataCurrent;
        expect(migratedData.schemaVersion).toBe(4);
        expect(migratedData.mocks).toBeDefined();
        expect(migratedData.mocks["##IN_PROGRESS_SELECTIONS##"]).toBeDefined();
        expect(migratedData.mocks["##IN_PROGRESS_SELECTIONS##"].year).toBe("2024");
        expect(migratedData.mocks["Bargain WRs"]).toBeDefined();
        expect(migratedData.mocks["Bargain WRs"].year).toBe("2024");
        expect(migratedData.mocks["Bargain WRs"].rosterSelections).toBeDefined();
        expect(migratedData.mocks["Bargain WRs"].rosterSelections["{\"position\":\"WR\",\"index\":0}"]).toBeDefined();
        expect(migratedData.mocks["Bargain WRs"].rosterSelections["{\"position\":\"WR\",\"index\":0}"]?.name).toBe("Jaylen Waddle");
        expect(migratedData.mocks["Bargain WRs"].rosterSelections["{\"position\":\"WR\",\"index\":0}"]?.id).toBe("4372016");
        expect(migratedData.mocks["Straight Ceiling Plays"]).toBeDefined();
        expect(migratedData.mocks["Straight Ceiling Plays"].estimationSettings).toBeDefined();
        expect(migratedData.mocks["Straight Ceiling Plays"].estimationSettings.years).toEqual(["2022", "2023"]);

    });
});