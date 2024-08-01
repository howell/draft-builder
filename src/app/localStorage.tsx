'use client'
import { RosterSelections, StoredData } from './types';

export const IN_PROGRESS_SELECTIONS_KEY = '##IN_PROGRESS_SELECTIONS##';

export function loadSavedLeagueInfo(leagueID: number): StoredData {
    const stored = localStorage.getItem(leagueID.toString());
    if (stored) {
        const leagueData = JSON.parse(stored);
        if (leagueData && leagueData[leagueID]) {
            return leagueData;
        }
    }
    return { [leagueID]: { drafts: {} } };
}

export function loadRosterByName(leagueID: number, rosterName: string): RosterSelections {
    const stored = loadSavedLeagueInfo(leagueID);
    const leagueData = stored[leagueID];
    const savedRosterSelections = leagueData.drafts[rosterName];
    if (savedRosterSelections) {
        return savedRosterSelections
    }
    return {};
}


export function saveSelectedRoster(leagueID: number, rosterName: string, selections: RosterSelections) {
    const stored = loadSavedLeagueInfo(leagueID);
    const withRoster = {
        ...stored,
        [leagueID]: {
            drafts: {
                ...stored[leagueID].drafts,
                [rosterName]: selections
            }
        }
    };
    localStorage.setItem(leagueID.toString(), JSON.stringify(withRoster));
}

export function deleteRoster(leagueID: number, rosterName: string) {
    const stored = loadSavedLeagueInfo(leagueID);
    const drafts = stored[leagueID].drafts;
    delete drafts[rosterName];
    localStorage.setItem(leagueID.toString(), JSON.stringify(stored));
}