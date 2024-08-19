import { CURRENT_MOCKS_SCHEMA_VERSION, StoredDataV2, StoredDataV3, StoredDraftDataV3 } from "./savedMockTypes";

export default function migrate(data: any): StoredDataV3 | undefined {
    while (data && data?.schemaVersion !== CURRENT_MOCKS_SCHEMA_VERSION) {
        if (data?.schemaVersion === 2) {
            data = migrateV2toV3(data);
        } else {
            data = undefined;
        }
    }
    return data;
}

function migrateV2toV3(data: StoredDataV2): StoredDataV3 {
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
