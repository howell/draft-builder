import { LeagueId, PlatformLeague } from '@/platforms/common';
import {
  StorageAdapter,
  type UserSettingType,
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
import { LiveDraftState, LiveDraftPick } from '@/app/storage/savedLiveDraftTypes';
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
   * Validate league data structure
   */
  private validateLeagueData(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    if (!data.schemaVersion || !data.leagues || typeof data.leagues !== 'object') return false;
    
    // Validate each league has required properties
    for (const [leagueId, league] of Object.entries(data.leagues)) {
      if (!league || typeof league !== 'object') return false;
      const l = league as any;
      if (!l.platform || !l.id || l.platform === null || l.id === null) return false;
    }
    
    return true;
  }

  /**
   * Load a user-level setting blob by type + key
   */
  async getUserSetting<T = unknown>(type: UserSettingType, key: string): Promise<T | undefined> {
    if (!this.isClient) return undefined;
    const stored = localStorage.getItem(`userSettings:${type}:${key}`);
    return stored ? (JSON.parse(stored) as T) : undefined;
  }

  /**
   * Persist a user-level setting blob by type + key
   */
  async setUserSetting<T = unknown>(type: UserSettingType, key: string, data: T): Promise<void> {
    if (!this.isClient) return;
    localStorage.setItem(`userSettings:${type}:${key}`, JSON.stringify(data));
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
      
      // Validate the parsed data structure
      if (!this.validateLeagueData(storedLeagues)) {
        throw new Error('Corrupted league data detected');
      }
      
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

  /**
   * Clear all user data from localStorage
   * This removes all leagues, drafts, and associated data from localStorage
   */
  async clearAllData(): Promise<void> {
    try {
      console.log('[LocalStorageAdapter] Clearing all localStorage data');
      
      if (!this.isClient) {
        console.log('[LocalStorageAdapter] Not in client environment, skipping data clear');
        return;
      }

      // Remove the main leagues data
      localStorage.removeItem(SAVED_LEAGUES_KEY);
      
      // Get all localStorage keys and remove league-specific mock data
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        // Remove league mock data (numeric keys) and other draft builder data
        if (/^\d+$/.test(key) || key.startsWith('draft-builder-')) {
          localStorage.removeItem(key);
        }
      }
      
      console.log('[LocalStorageAdapter] ✅ Successfully cleared all localStorage data');
    } catch (error) {
      this.logError('clearAllData', error);
      throw createStorageError(
        'DATA_ERROR',
        'Failed to clear localStorage data',
        error,
        { operation: 'clearAllData' }
      );
    }
  }

  // Live Draft Methods - Not implemented (localStorage is deprecated)

  async loadLiveDrafts(leagueId: LeagueId): Promise<LiveDraftState[]> {
    throw createStorageError(
      'NOT_AVAILABLE_SSR',
      'Live drafts not supported in deprecated localStorage adapter',
      undefined,
      { operation: 'loadLiveDrafts', leagueId }
    );
  }

  async loadLiveDraft(leagueId: LeagueId, draftId: string): Promise<LiveDraftState | undefined> {
    throw createStorageError(
      'NOT_AVAILABLE_SSR',
      'Live drafts not supported in deprecated localStorage adapter',
      undefined,
      { operation: 'loadLiveDraft', leagueId }
    );
  }

  async saveLiveDraft(leagueId: LeagueId, draftState: LiveDraftState): Promise<void> {
    throw createStorageError(
      'NOT_AVAILABLE_SSR',
      'Live drafts not supported in deprecated localStorage adapter',
      undefined,
      { operation: 'saveLiveDraft', leagueId }
    );
  }

  async addLiveDraftPick(leagueId: LeagueId, draftId: string, pick: LiveDraftPick): Promise<void> {
    throw createStorageError(
      'NOT_AVAILABLE_SSR',
      'Live drafts not supported in deprecated localStorage adapter',
      undefined,
      { operation: 'addLiveDraftPick', leagueId }
    );
  }

  async updateLiveDraftPick(leagueId: LeagueId, draftId: string, pickNumber: number, updatedPick: LiveDraftPick): Promise<void> {
    throw createStorageError(
      'NOT_AVAILABLE_SSR',
      'Live drafts not supported in deprecated localStorage adapter',
      undefined,
      { operation: 'updateLiveDraftPick', leagueId }
    );
  }

  async deleteLiveDraftPick(leagueId: LeagueId, draftId: string, pickNumber: number): Promise<void> {
    throw createStorageError(
      'NOT_AVAILABLE_SSR',
      'Live drafts not supported in deprecated localStorage adapter',
      undefined,
      { operation: 'deleteLiveDraftPick', leagueId }
    );
  }

  async deleteLiveDraft(leagueId: LeagueId, draftId: string): Promise<void> {
    throw createStorageError(
      'NOT_AVAILABLE_SSR',
      'Live drafts not supported in deprecated localStorage adapter',
      undefined,
      { operation: 'deleteLiveDraft', leagueId }
    );
  }
} 