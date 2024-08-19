'use client'
import { PlatformLeague } from '@/platforms/common';
import { RosterSelections, StoredData, StoredMocksDataV3, CURRENT_MOCKS_SCHEMA_VERSION, EstimationSettingsState, SearchSettingsState, StoredDataCurrent, StoredDraftDataV3, StoredMocksDataCurrent, StoredDraftDataCurrent } from './savedMockTypes';
import migrateMocks from './savedMockMigrations';
import { CURRENT_LEAGUES_SCHEMA_VERSION, StoredLeaguesData } from './savedLeagueTypes';
import { CURRENT_SEASON } from '@/constants';

export const IN_PROGRESS_SELECTIONS_KEY = '##IN_PROGRESS_SELECTIONS##';

const isClient = typeof window !== 'undefined';

export const SAVED_LEAGUES_KEY = 'leagues';

export function emptyData(leagueID: number): StoredMocksDataV3 {
    return { drafts: {} };
}

const emptyLeagues: StoredLeaguesData = { schemaVersion: CURRENT_MOCKS_SCHEMA_VERSION, leagues: {} };

export function loadSavedMocks(leagueID: number): StoredMocksDataCurrent {
    if (!isClient) return emptyData(leagueID);
    const stored = localStorage.getItem(leagueID.toString());
    if (!stored) return emptyData(leagueID);

    let leagueData: StoredData | undefined = JSON.parse(stored);
    if (leagueData && leagueData.schemaVersion !== CURRENT_MOCKS_SCHEMA_VERSION) {
        leagueData = migrateMocks(leagueData);
        if (leagueData) {
            localStorage.setItem(leagueID.toString(), JSON.stringify(leagueData));
        }
        
    }
    if (!leagueData) {
        localStorage.removeItem(leagueID.toString());
        return emptyData(leagueID);
    }
    if (leagueData[leagueID]) {
        return leagueData[leagueID];
    }
    return emptyData(leagueID);
}

export function saveMock(leagueID: number, data: StoredMocksDataCurrent): void {
    if (!isClient) return;
    const stored = localStorage.getItem(leagueID.toString());
    const storedData = stored ? JSON.parse(stored) : undefined;
    let leagueData: StoredData | undefined = storedData;
    if (leagueData && leagueData.schemaVersion !== CURRENT_MOCKS_SCHEMA_VERSION) {
        leagueData = migrateMocks(leagueData);
    }
    if (!leagueData) {
        const toStore: StoredDataCurrent = {
            schemaVersion: CURRENT_MOCKS_SCHEMA_VERSION,
            [leagueID]: data
        };
        localStorage.setItem(leagueID.toString(), JSON.stringify(toStore));
        return;
    }
    const toStore: StoredData = {
        ...leagueData,
        [leagueID]: data
    };
    localStorage.setItem(leagueID.toString(), JSON.stringify(toStore));
    return;
}

export function loadDraftByName(leagueID: number, rosterName: string): StoredDraftDataCurrent | undefined {
    const leagueData = loadSavedMocks(leagueID);
    const savedRosterSelections = leagueData.drafts[rosterName];
    if (savedRosterSelections) {
        return savedRosterSelections
    }
    return undefined;
}


export function saveSelectedRoster(leagueID: number, rosterName: string, rosterSelections: RosterSelections, costAdjustments: Record<string, number>, estimationSettings: EstimationSettingsState, searchSettings: SearchSettingsState, notes: string = '') {
    if (!isClient) return;
    const stored = loadSavedMocks(leagueID);
    const prev = stored.drafts[rosterName];
    const modified = Date.now();
    const created = prev ? prev.created : modified;
    const year = CURRENT_SEASON;
    const mock: StoredDraftDataV3 = {
        year,
        created,
        modified,
        rosterSelections,
        costAdjustments,
        estimationSettings,
        searchSettings,
        notes
    }
    const withRoster = {
        drafts: {
            ...stored.drafts,
            [rosterName]: mock
        }
    };
    saveMock(leagueID, withRoster);
}

export function deleteRoster(leagueID: number, rosterName: string) {
    if (!isClient) return;
    const stored = loadSavedMocks(leagueID);
    const drafts = stored.drafts;
    delete drafts[rosterName];
    saveMock(leagueID, stored);
}

export function saveLeague(leagueID: number, league: PlatformLeague) {
    if (!isClient) return;
    const stored = localStorage.getItem(SAVED_LEAGUES_KEY);
    const storedLeagues: StoredLeaguesData = stored ? JSON.parse(stored) : undefined;
    if (!storedLeagues || storedLeagues.schemaVersion !== CURRENT_LEAGUES_SCHEMA_VERSION) {
        const toStore: StoredLeaguesData = {
            schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
            leagues: { [leagueID]: league }
        };
        localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify(toStore));
        return;
    }
    const toStore: StoredLeaguesData = {
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: {
            ...storedLeagues.leagues,
            [leagueID]: league
        }
    };
    localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify(toStore));
}

export function loadLeagues(): StoredLeaguesData {
    if (!isClient) return emptyLeagues;
    const stored = localStorage.getItem(SAVED_LEAGUES_KEY);
    if (!stored) return emptyLeagues;

    const storedLeagues: StoredLeaguesData = JSON.parse(stored);
    if (!storedLeagues || storedLeagues.schemaVersion !== CURRENT_LEAGUES_SCHEMA_VERSION) {
        localStorage.removeItem(SAVED_LEAGUES_KEY);
        return emptyLeagues;
    }
    return storedLeagues;
}

export function loadLeague(leagueID: number): PlatformLeague | undefined {
    const stored = loadLeagues();
    return stored.leagues[leagueID];
}