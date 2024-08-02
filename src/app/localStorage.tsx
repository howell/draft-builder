'use client'
import { RosterSelections, StoredData, StoredLeagueData, CURRENT_SCHEMA_VERSION } from './types';

export const IN_PROGRESS_SELECTIONS_KEY = '##IN_PROGRESS_SELECTIONS##';

const isClient = typeof window !== 'undefined';

export function emptyData(leagueID: number): StoredLeagueData {
    return { drafts: {} };

}

export function loadSavedLeagueInfo(leagueID: number): StoredLeagueData {
    if (!isClient) return emptyData(leagueID);
    const stored = localStorage.getItem(leagueID.toString());
    if (!stored) return emptyData(leagueID);

    const leagueData: StoredData = JSON.parse(stored);
    if (leagueData && leagueData.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        localStorage.removeItem(leagueID.toString());
        return emptyData(leagueID);
    }

    if (leagueData[leagueID]) {
        return leagueData[leagueID];
    }
    return emptyData(leagueID);
}

export function saveLeagueInfo(leagueID: number, data: StoredLeagueData): void {
    if (!isClient) return;
    const stored = localStorage.getItem(leagueID.toString());
    const storedData = stored ? JSON.parse(stored) : null;
    if (!storedData || storedData.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        const toStore: StoredData = {
            schemaVersion: CURRENT_SCHEMA_VERSION,
            [leagueID]: data
        };
        localStorage.setItem(leagueID.toString(), JSON.stringify(toStore));
        return;
    }
    const toStore: StoredData = {
        ...storedData,
        [leagueID]: data
    };
    localStorage.setItem(leagueID.toString(), JSON.stringify(toStore));
    return;
}

export function loadRosterByName(leagueID: number, rosterName: string): RosterSelections {
    const leagueData = loadSavedLeagueInfo(leagueID);
    const savedRosterSelections = leagueData.drafts[rosterName];
    if (savedRosterSelections) {
        return savedRosterSelections
    }
    return {};
}


export function saveSelectedRoster(leagueID: number, rosterName: string, selections: RosterSelections) {
    if (!isClient) return;
    const stored = loadSavedLeagueInfo(leagueID);
    const withRoster = {
        drafts: {
            ...stored.drafts,
            [rosterName]: selections
        }
    };
    saveLeagueInfo(leagueID, withRoster);
}

export function deleteRoster(leagueID: number, rosterName: string) {
    if (!isClient) return;
    const stored = loadSavedLeagueInfo(leagueID);
    const drafts = stored.drafts;
    delete drafts[rosterName];
    saveLeagueInfo(leagueID, stored);
}