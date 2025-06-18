import { LeagueId, PlatformLeague } from '@/platforms/common';
import { 
  StorageAdapter, 
  createStorageError, 
  type StorageErrorCode 
} from './interface';
import {
  StoredLeaguesDataCurrent,
  StoredMocksDataCurrent,
  StoredDraftDataCurrent,
  RosterSelections,
  EstimationSettingsState,
  SearchSettingsState,
  CURRENT_LEAGUES_SCHEMA_VERSION,
  CURRENT_MOCKS_SCHEMA_VERSION,
  StoredData,
  StoredDataCurrent
} from '@/types/storage';
import { CURRENT_SEASON } from '@/constants';
import { IN_PROGRESS_SELECTIONS_KEY, SAVED_LEAGUES_KEY } from './constants';
import { migrateMocks, migrateLeagues } from './migrations';

/**
 * LocalStorageAdapter implements the StorageAdapter interface using localStorage
 * This wraps existing localStorage functions with async methods and error handling
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly isClient = typeof window !== 'undefined';

  /**
   * Log errors consistently for localStorage operations
   */
  private logError(operation: string, error: any, context?: { leagueId?: LeagueId; rosterName?: string }): void {
    console.error(`[LocalStorage] Error in ${operation}:`, error);
    if (context) {
      console.error(`[LocalStorage] Context:`, context);
    }
  }

  /**
   * Load all saved leagues for the current user
   */
  async loadLeagues(): Promise<StoredLeaguesDataCurrent> {
    try {
      if (!this.isClient) {
        return { schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION, leagues: {} };
      }

      const stored = localStorage.getItem(SAVED_LEAGUES_KEY);
      if (!stored) {
        return { schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION, leagues: {} };
      }

      let storedLeagues = JSON.parse(stored);
      if (storedLeagues && storedLeagues.schemaVersion !== CURRENT_LEAGUES_SCHEMA_VERSION) {
        storedLeagues = migrateLeagues(storedLeagues);
        if (storedLeagues) {
          localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify(storedLeagues));
        }
      }

      if (!storedLeagues) {
        localStorage.removeItem(SAVED_LEAGUES_KEY);
        return { schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION, leagues: {} };
      }

      return storedLeagues;
    } catch (error) {
      this.logError('loadLeagues', error);
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load leagues from localStorage',
        error,
        { operation: 'loadLeagues' }
      );
    }
  }

  /**
   * Save a league configuration
   */
  async saveLeague(leagueId: LeagueId, league: PlatformLeague): Promise<void> {
    try {
      if (!this.isClient) return;

      const stored = localStorage.getItem(SAVED_LEAGUES_KEY);
      let storedLeagues = stored ? JSON.parse(stored) : undefined;
      
      if (storedLeagues && storedLeagues.schemaVersion !== CURRENT_LEAGUES_SCHEMA_VERSION) {
        storedLeagues = migrateLeagues(storedLeagues);
        if (storedLeagues) {
          localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify(storedLeagues));
        }
      }

      if (!storedLeagues) {
        const toStore: StoredLeaguesDataCurrent = {
          schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
          leagues: { [leagueId]: league }
        };
        localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify(toStore));
        return;
      }

      const toStore: StoredLeaguesDataCurrent = {
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: {
          ...storedLeagues.leagues,
          [leagueId]: league
        }
      };
      localStorage.setItem(SAVED_LEAGUES_KEY, JSON.stringify(toStore));
    } catch (error) {
      this.logError('saveLeague', error, { leagueId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save league to localStorage',
        error,
        { operation: 'saveLeague', leagueId }
      );
    }
  }

  /**
   * Load a single league by ID
   */
  async loadLeague(leagueId: LeagueId): Promise<PlatformLeague | undefined> {
    try {
      const stored = await this.loadLeagues();
      return stored.leagues[leagueId];
    } catch (error) {
      this.logError('loadLeague', error, { leagueId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load league from localStorage',
        error,
        { operation: 'loadLeague', leagueId }
      );
    }
  }

  /**
   * Load all saved mock drafts for a specific league
   */
  async loadSavedMocks(leagueId: LeagueId): Promise<StoredMocksDataCurrent> {
    try {
      if (!this.isClient) return {};

      const stored = localStorage.getItem(leagueId.toString());
      if (!stored) return {};

      let leagueData: StoredData | undefined = JSON.parse(stored);
      if (leagueData && leagueData.schemaVersion !== CURRENT_MOCKS_SCHEMA_VERSION) {
        leagueData = migrateMocks(leagueData);
        if (leagueData) {
          localStorage.setItem(leagueId.toString(), JSON.stringify(leagueData));
        }
      }

      if (!leagueData) {
        localStorage.removeItem(leagueId.toString());
        return {};
      }

      const data = leagueData as StoredDataCurrent;
      return data.mocks || {};
    } catch (error) {
      this.logError('loadSavedMocks', error, { leagueId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load saved mocks from localStorage',
        error,
        { operation: 'loadSavedMocks', leagueId }
      );
    }
  }

  /**
   * Save mock draft data for a league
   */
  async saveMock(leagueId: LeagueId, data: StoredMocksDataCurrent): Promise<void> {
    try {
      if (!this.isClient) return;

      const stored = localStorage.getItem(leagueId.toString());
      const storedData = stored ? JSON.parse(stored) : undefined;
      let leagueData: StoredData | undefined = storedData;
      
      if (leagueData && leagueData.schemaVersion !== CURRENT_MOCKS_SCHEMA_VERSION) {
        leagueData = migrateMocks(leagueData);
      }

      if (!leagueData) {
        const toStore: StoredDataCurrent = {
          schemaVersion: CURRENT_MOCKS_SCHEMA_VERSION,
          mocks: { ...data }
        };
        localStorage.setItem(leagueId.toString(), JSON.stringify(toStore));
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
      localStorage.setItem(leagueId.toString(), JSON.stringify(toStore));
    } catch (error) {
      this.logError('saveMock', error, { leagueId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save mock draft to localStorage',
        error,
        { operation: 'saveMock', leagueId }
      );
    }
  }

  /**
   * Load a specific draft by name within a league
   */
  async loadDraftByName(leagueId: LeagueId, rosterName: string): Promise<StoredDraftDataCurrent | undefined> {
    try {
      const leagueData = await this.loadSavedMocks(leagueId);
      return leagueData[rosterName];
    } catch (error) {
      this.logError('loadDraftByName', error, { leagueId, rosterName });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load draft by name from localStorage',
        error,
        { operation: 'loadDraftByName', leagueId, rosterName }
      );
    }
  }

  /**
   * Save a complete roster/draft configuration
   */
  async saveSelectedRoster(
    leagueId: LeagueId,
    rosterName: string,
    rosterSelections: RosterSelections,
    costAdjustments: Record<string, number>,
    estimationSettings: EstimationSettingsState,
    searchSettings: SearchSettingsState,
    notes: string = ''
  ): Promise<void> {
    try {
      if (!this.isClient) return;

      const stored = await this.loadSavedMocks(leagueId);
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
      };

      const withRoster = {
        [rosterName]: mock
      };
      
      await this.saveMock(leagueId, withRoster);
    } catch (error) {
      this.logError('saveSelectedRoster', error, { leagueId, rosterName });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save selected roster to localStorage',
        error,
        { operation: 'saveSelectedRoster', leagueId, rosterName }
      );
    }
  }

  /**
   * Delete a specific roster/draft
   */
  async deleteRoster(leagueId: LeagueId, rosterName: string): Promise<void> {
    try {
      if (!this.isClient) return;

      const stored = await this.loadSavedMocks(leagueId);
      delete stored[rosterName];
      
      const toStore: StoredDataCurrent = {
        schemaVersion: CURRENT_MOCKS_SCHEMA_VERSION,
        mocks: stored
      };
      
      localStorage.setItem(leagueId.toString(), JSON.stringify(toStore));
    } catch (error) {
      this.logError('deleteRoster', error, { leagueId, rosterName });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to delete roster from localStorage',
        error,
        { operation: 'deleteRoster', leagueId, rosterName }
      );
    }
  }
} 