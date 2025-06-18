import { LeagueId, PlatformLeague } from '@/platforms/common';
import { 
  StorageAdapter, 
  createStorageError 
} from './interface';
import { deepClone } from './utils/deepClone';
import {
  StoredLeaguesDataCurrent,
  StoredMocksDataCurrent,
  StoredDraftDataCurrent,
  RosterSelections,
  EstimationSettingsState,
  SearchSettingsState,
  CURRENT_LEAGUES_SCHEMA_VERSION,
  CURRENT_MOCKS_SCHEMA_VERSION
} from '@/types/storage';
import { CURRENT_SEASON } from '@/constants';

/**
 * MemoryStorageAdapter implements the StorageAdapter interface using in-memory storage
 * This is primarily intended for testing but can also be used for ephemeral storage
 */
export class MemoryStorageAdapter implements StorageAdapter {
  private leagues: StoredLeaguesDataCurrent = {
    schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
    leagues: {}
  };
  private mocks: Map<LeagueId, StoredMocksDataCurrent> = new Map();

  /**
   * Reset all stored data (useful for test cleanup)
   */
  reset(): void {
    this.leagues = {
      schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
      leagues: {}
    };
    this.mocks.clear();
  }

  /**
   * Load all saved leagues for the current user
   */
  async loadLeagues(): Promise<StoredLeaguesDataCurrent> {
    try {
      return Promise.resolve(deepClone(this.leagues));
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load leagues from memory',
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
      this.leagues.leagues[leagueId] = deepClone(league);
      return Promise.resolve();
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save league to memory',
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
      const league = this.leagues.leagues[leagueId];
      return Promise.resolve(league ? deepClone(league) : undefined);
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load league from memory',
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
      const mocks = this.mocks.get(leagueId) || {};
      return Promise.resolve(deepClone(mocks));
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load saved mocks from memory',
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
      const existing = this.mocks.get(leagueId) || {};
      const updated = {
        ...existing,
        ...deepClone(data)
      };
      this.mocks.set(leagueId, updated);
      return Promise.resolve();
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save mock draft to memory',
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
      const mocks = await this.loadSavedMocks(leagueId);
      return mocks[rosterName];
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load draft by name from memory',
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
      const stored = await this.loadSavedMocks(leagueId);
      const prev = stored[rosterName];
      const modified = Date.now();
      const created = prev ? prev.created : modified;
      const year = CURRENT_SEASON;
      
      const mock: StoredDraftDataCurrent = {
        year,
        created,
        modified,
        rosterSelections: deepClone(rosterSelections),
        costAdjustments: deepClone(costAdjustments),
        estimationSettings: deepClone(estimationSettings),
        searchSettings: deepClone(searchSettings),
        notes
      };

      const withRoster = {
        [rosterName]: mock
      };
      
      await this.saveMock(leagueId, withRoster);
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save selected roster to memory',
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
      const stored = await this.loadSavedMocks(leagueId);
      delete stored[rosterName];
      
      this.mocks.set(leagueId, stored);
      return Promise.resolve();
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to delete roster from memory',
        error,
        { operation: 'deleteRoster', leagueId, rosterName }
      );
    }
  }
} 