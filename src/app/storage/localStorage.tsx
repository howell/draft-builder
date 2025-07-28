'use client'
import { LeagueId, PlatformLeague } from '@/platforms/common';
import { RosterSelections, StoredData, StoredMocksDataV3, CURRENT_MOCKS_SCHEMA_VERSION, EstimationSettingsState, SearchSettingsState, StoredDataCurrent, StoredDraftDataV3, StoredMocksDataCurrent, StoredDraftDataCurrent } from './savedMockTypes';
import migrateMocks from './savedMockMigrations';
import migrateLeagues from './savedLeagueMigrations'
import { CURRENT_LEAGUES_SCHEMA_VERSION, StoredLeaguesData, StoredLeaguesDataCurrent, StoredLeaguesDataV2 } from './savedLeagueTypes';
import { CURRENT_SEASON } from '@/constants';
import { 
  getDefaultStorageAdapter, 
  type StorageAdapter, 
  IN_PROGRESS_SELECTIONS_KEY as STORAGE_IN_PROGRESS_KEY,
  SAVED_LEAGUES_KEY as STORAGE_SAVED_LEAGUES_KEY
} from '@/lib/storage';

export const IN_PROGRESS_SELECTIONS_KEY = STORAGE_IN_PROGRESS_KEY;
export const SAVED_LEAGUES_KEY = STORAGE_SAVED_LEAGUES_KEY;

const isClient = typeof window !== 'undefined';

// Get the storage adapter instance
let storageAdapter: StorageAdapter | null = null;
function getStorageAdapter(): StorageAdapter {
  if (!storageAdapter) {
    storageAdapter = getDefaultStorageAdapter();
  }
  return storageAdapter;
}

export function emptyData(leagueID: LeagueId): StoredMocksDataCurrent {
    return { };
}

const emptyLeagues: StoredLeaguesDataCurrent = { schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION, leagues: {} };

export function loadSavedMocks(leagueID: LeagueId): StoredMocksDataCurrent {
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
    const data = leagueData as StoredDataCurrent;
    if (data.mocks) {
        return data.mocks;
    }
    return emptyData(leagueID);
}

export function saveMock(leagueID: LeagueId, data: StoredMocksDataCurrent): void {
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
            mocks: {
                ...data
            }
        };
        localStorage.setItem(leagueID.toString(), JSON.stringify(toStore));
        return;
    }
    leagueData = leagueData as StoredDataCurrent;
    const toStore: StoredData = {
        schemaVersion: leagueData.schemaVersion,
        mocks: {
            ...leagueData.mocks,
            ...data
        }
    };
    localStorage.setItem(leagueID.toString(), JSON.stringify(toStore));
    return;
}

export function loadDraftByName(leagueID: LeagueId, rosterName: string): StoredDraftDataCurrent | undefined {
    const leagueData = loadSavedMocks(leagueID);
    const savedRosterSelections = leagueData[rosterName];
    if (savedRosterSelections) {
        return savedRosterSelections
    }
    return undefined;
}


export function saveSelectedRoster(leagueID: LeagueId,
    rosterName: string,
    rosterSelections: RosterSelections,
    costAdjustments: Record<string, number>,
    estimationSettings: EstimationSettingsState,
    searchSettings: SearchSettingsState,
    notes: string = '')
{
    if (!isClient) return;
    const stored = loadSavedMocks(leagueID);
    const prev = stored[rosterName];
    const modified = Date.now();
    const created = prev ? prev.created : modified;
    const year = CURRENT_SEASON;
    const mock: StoredDraftDataCurrent = {
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
        [rosterName]: mock
    };
    saveMock(leagueID, withRoster);
}

export function deleteRoster(leagueID: LeagueId, rosterName: string) {
    if (!isClient) return;
    const stored = loadSavedMocks(leagueID);
    delete stored[rosterName];
    const toStore: StoredDataCurrent = {
        schemaVersion: CURRENT_MOCKS_SCHEMA_VERSION,
        mocks: stored
    };
    localStorage.setItem(leagueID.toString(), JSON.stringify(toStore));
}

export function saveLeague(leagueID: LeagueId, league: PlatformLeague) {
    if (!isClient) return;
    const stored = localStorage.getItem(SAVED_LEAGUES_KEY);
    let storedLeagues: StoredLeaguesData | undefined = stored ? JSON.parse(stored) : undefined;
    if (storedLeagues && storedLeagues.schemaVersion !== CURRENT_LEAGUES_SCHEMA_VERSION) {
        storedLeagues = migrateLeagues(storedLeagues);
        if (storedLeagues) {
            localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify(storedLeagues));
        }
    }
    if (!storedLeagues) {
        const toStore: StoredLeaguesDataCurrent = {
            schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
            leagues: { [leagueID]: league }
        };
        localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify(toStore));
        return;
    }
    const toStore: StoredLeaguesDataCurrent = {
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: {
            ...storedLeagues.leagues,
            [leagueID]: league
        }
    };
    localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify(toStore));
}

export function loadLeagues(): StoredLeaguesDataCurrent {
    if (!isClient) return emptyLeagues;
    const stored = localStorage.getItem(SAVED_LEAGUES_KEY);
    if (!stored) return emptyLeagues;

    let storedLeagues: StoredLeaguesData | undefined = JSON.parse(stored);
    if (storedLeagues && storedLeagues.schemaVersion !== CURRENT_LEAGUES_SCHEMA_VERSION) {
        storedLeagues = migrateLeagues(storedLeagues);
        if (storedLeagues) {
            localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify(storedLeagues));
        }
    }
    if (!storedLeagues) {
        localStorage.removeItem(SAVED_LEAGUES_KEY);
        return emptyLeagues;
    }
    return storedLeagues;
}

export function loadLeague(leagueID: LeagueId): PlatformLeague | undefined {
    const stored = loadLeagues();
    return stored.leagues[leagueID];
}

// ================================================================================
// ASYNC STORAGE API - New StorageAdapter-based functions for converted components
// ================================================================================

/**
 * Async version of loadLeagues using StorageAdapter
 * Use this in components that have been converted to async patterns
 */
export async function loadLeaguesAsync(): Promise<StoredLeaguesDataCurrent> {
    try {
        return await getStorageAdapter().loadLeagues();
    } catch (error) {
        console.error('[Storage] Failed to load leagues:', error);
        // Return empty data structure on error to prevent app crashes
        return { schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION, leagues: {} };
    }
}

/**
 * Async version of saveLeague using StorageAdapter
 */
export async function saveLeagueAsync(leagueID: LeagueId, league: PlatformLeague): Promise<void> {
    try {
        await getStorageAdapter().saveLeague(leagueID, league);
    } catch (error) {
        console.error('[Storage] Failed to save league:', error);
        throw error; // Re-throw to allow component error handling
    }
}

/**
 * Async version of loadLeague using StorageAdapter
 */
export async function loadLeagueAsync(leagueID: LeagueId): Promise<PlatformLeague | undefined> {
    try {
        return await getStorageAdapter().loadLeague(leagueID);
    } catch (error) {
        console.error('[Storage] Failed to load league:', error);
        return undefined; // Return undefined on error for consistency with sync version
    }
}

/**
 * Async version of loadSavedMocks using StorageAdapter
 */
export async function loadSavedMocksAsync(leagueID: LeagueId): Promise<StoredMocksDataCurrent> {
    try {
        return await getStorageAdapter().loadSavedMocks(leagueID);
    } catch (error) {
        console.error('[Storage] Failed to load saved mocks:', error);
        return {}; // Return empty object on error
    }
}

/**
 * Async version of saveMock using StorageAdapter
 */
export async function saveMockAsync(leagueID: LeagueId, data: StoredMocksDataCurrent): Promise<void> {
    try {
        await getStorageAdapter().saveMock(leagueID, data);
    } catch (error) {
        console.error('[Storage] Failed to save mock:', error);
        throw error; // Re-throw to allow component error handling
    }
}

/**
 * Async version of loadDraftByName using StorageAdapter
 */
export async function loadDraftByNameAsync(leagueID: LeagueId, rosterName: string): Promise<StoredDraftDataCurrent | undefined> {
    try {
        return await getStorageAdapter().loadDraftByName(leagueID, rosterName);
    } catch (error) {
        console.error('[Storage] Failed to load draft by name:', error);
        return undefined; // Return undefined on error
    }
}

/**
 * Async version of saveSelectedRoster using StorageAdapter
 */
export async function saveSelectedRosterAsync(
    leagueID: LeagueId,
    rosterName: string,
    rosterSelections: RosterSelections,
    costAdjustments: Record<string, number>,
    estimationSettings: EstimationSettingsState,
    searchSettings: SearchSettingsState,
    notes: string = ''
): Promise<void> {
    try {
        await getStorageAdapter().saveSelectedRoster(
            leagueID,
            rosterName,
            rosterSelections,
            costAdjustments,
            estimationSettings,
            searchSettings,
            notes
        );
    } catch (error) {
        console.error('[Storage] Failed to save selected roster:', error);
        throw error; // Re-throw to allow component error handling
    }
}

/**
 * Async version of deleteRoster using StorageAdapter
 */
export async function deleteRosterAsync(leagueID: LeagueId, rosterName: string): Promise<void> {
    try {
        await getStorageAdapter().deleteRoster(leagueID, rosterName);
    } catch (error) {
        console.error('[Storage] Failed to delete roster:', error);
        throw error; // Re-throw to allow component error handling
    }
}