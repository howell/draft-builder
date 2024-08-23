import { CURRENT_LEAGUES_SCHEMA_VERSION, StoredLeaguesDataCurrent, StoredLeaguesDataV2, StoredLeaguesDataV3 } from "./savedLeagueTypes";

export default function migrate(data: any): StoredLeaguesDataCurrent | undefined {
    while (data && data?.schemaVersion !== CURRENT_LEAGUES_SCHEMA_VERSION) {
        switch (data?.schemaVersion) {
            case 2:
                data = migrateV2toV3(data);
                continue;
            default:
                data = undefined;
        }
    }
    return data;
}

export function migrateV2toV3(data: StoredLeaguesDataV2): StoredLeaguesDataV3 {
    const leagues: StoredLeaguesDataV3["leagues"] = {};
    for (const leagueKey in data.leagues) {
        leagues[leagueKey] = data.leagues[leagueKey];
        leagues[leagueKey].id = leagueKey;
    }
    return {
        schemaVersion: 3,
        leagues: leagues,
    };
}
