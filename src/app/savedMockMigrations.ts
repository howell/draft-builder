import { CURRENT_MOCKS_SCHEMA_VERSION, StoredDataCurrent, StoredDataV2, StoredDataV3, StoredDataV4, StoredDraftDataV3, StoredDraftDataV4, StoredMocksDataV3, StoredMocksDataV4 } from "./savedMockTypes";

export default function migrate(data: any): StoredDataCurrent | undefined {
    while (data && data?.schemaVersion !== CURRENT_MOCKS_SCHEMA_VERSION) {
        if (data?.schemaVersion === 2) {
            data = migrateV2toV3(data);
        } else if (data?.schemaVersion === 3) {
            data = migrateV3toV4(data);
        } else {
            data = undefined;
        }
    }
    return data;
}

export function migrateV2toV3(data: StoredDataV2): StoredDataV3 {
    const base: StoredDataV3 = {
        schemaVersion: 3,
    };
    for (const leagueKey in data) {
        if (leagueKey === "schemaVersion") continue;
        const drafts: { [draftName: string]: StoredDraftDataV3 } = {};
        for (const draftKey in data[leagueKey].drafts) {
            drafts[draftKey] = { ...data[leagueKey].drafts[draftKey], costAdjustments: {} };
        }
        base[parseInt(leagueKey)] = { drafts };
    }
    return base;
}

export function migrateV3toV4(data: StoredDataV3): StoredDataV4 {
    let mocks: StoredDataV4["mocks"] = {};
    for (const leagueKey in data) {
        if (leagueKey === "schemaVersion") continue;
        mocks = {
            ...mocks,
            ...migrateMocksV3toV4(data[leagueKey])
        };
    }
    return {
        schemaVersion: 4,
        mocks
    };
}

export function migrateMocksV3toV4(data: StoredMocksDataV3): StoredMocksDataV4 {
    const drafts: StoredMocksDataV4 = {};
    for (const draftKey in data.drafts) {
        drafts[draftKey] = migrateDraftV3toV4(data.drafts[draftKey]);
    }
    return drafts;
}

export function migrateDraftV3toV4(data: StoredDraftDataV3): StoredDraftDataV4 {
    const rosterSelections = Object.entries(data.rosterSelections)
        .map(([slot, selection]) => [slot, selection && { ...selection, id: selection.id.toString() }]);
    return {
        ...data,
        year: data.year.toString(),
        rosterSelections: Object.fromEntries(rosterSelections),
        estimationSettings: {
            ...data.estimationSettings,
            years: data.estimationSettings.years.map(year => year.toString())
        }
    };
}