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
import { LiveDraftState, LiveDraftPick } from '@/app/storage/savedLiveDraftTypes';
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
  private liveDrafts: Map<LeagueId, LiveDraftState[]> = new Map();

  /**
   * Reset all stored data (useful for test cleanup)
   */
  reset(): void {
    this.leagues = {
      schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
      leagues: {}
    };
    this.mocks.clear();
    this.liveDrafts.clear();
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

  /**
   * Clear all data from memory storage
   * This resets all in-memory data to empty state
   */
  async clearAllData(): Promise<void> {
    try {
      console.log('[MemoryStorageAdapter] Clearing all in-memory data');
      this.reset(); // Use existing reset method
      console.log('[MemoryStorageAdapter] ✅ Successfully cleared all data');
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to clear memory data',
        error,
        { operation: 'clearAllData' }
      );
    }
  }

  // Live Draft Methods

  /**
   * Load all live drafts for a specific league
   */
  async loadLiveDrafts(leagueId: LeagueId): Promise<LiveDraftState[]> {
    try {
      const drafts = this.liveDrafts.get(leagueId) || [];
      return Promise.resolve(deepClone(drafts));
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load live drafts from memory',
        error,
        { operation: 'loadLiveDrafts', leagueId }
      );
    }
  }

  /**
   * Load a specific live draft by ID
   */
  async loadLiveDraft(leagueId: LeagueId, draftId: string): Promise<LiveDraftState | undefined> {
    try {
      const drafts = await this.loadLiveDrafts(leagueId);
      const draft = drafts.find(d => d.draftId === draftId);
      return Promise.resolve(draft ? deepClone(draft) : undefined);
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load live draft from memory',
        error,
        { operation: 'loadLiveDraft', leagueId }
      );
    }
  }

  /**
   * Save/create a live draft
   */
  async saveLiveDraft(leagueId: LeagueId, draftState: LiveDraftState): Promise<void> {
    try {
      const drafts = await this.loadLiveDrafts(leagueId);
      const existingIndex = drafts.findIndex(d => d.draftId === draftState.draftId);
      
      const updatedDraft = {
        ...deepClone(draftState),
        modified: Date.now()
      };

      if (existingIndex >= 0) {
        drafts[existingIndex] = updatedDraft;
      } else {
        drafts.push(updatedDraft);
      }
      
      this.liveDrafts.set(leagueId, drafts);
      return Promise.resolve();
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save live draft to memory',
        error,
        { operation: 'saveLiveDraft', leagueId }
      );
    }
  }

  /**
   * Add a pick to a live draft
   */
  async addLiveDraftPick(leagueId: LeagueId, draftId: string, pick: LiveDraftPick): Promise<void> {
    try {
      const draft = await this.loadLiveDraft(leagueId, draftId);
      if (!draft) {
        throw new Error(`Live draft ${draftId} not found in league ${leagueId}`);
      }

      draft.picks.push(deepClone(pick));
      draft.currentPickNumber = Math.max(draft.currentPickNumber, pick.pickNumber + 1);
      await this.saveLiveDraft(leagueId, draft);
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to add pick to live draft in memory',
        error,
        { operation: 'addLiveDraftPick', leagueId }
      );
    }
  }

  /**
   * Update an existing pick in a live draft
   */
  async updateLiveDraftPick(leagueId: LeagueId, draftId: string, pickNumber: number, updatedPick: LiveDraftPick): Promise<void> {
    try {
      const draft = await this.loadLiveDraft(leagueId, draftId);
      if (!draft) {
        throw new Error(`Live draft ${draftId} not found in league ${leagueId}`);
      }

      const pickIndex = draft.picks.findIndex(p => p.pickNumber === pickNumber);
      if (pickIndex === -1) {
        throw new Error(`Pick ${pickNumber} not found in draft ${draftId}`);
      }

      draft.picks[pickIndex] = deepClone(updatedPick);
      await this.saveLiveDraft(leagueId, draft);
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to update pick in live draft in memory',
        error,
        { operation: 'updateLiveDraftPick', leagueId }
      );
    }
  }

  /**
   * Delete a pick from a live draft
   */
  async deleteLiveDraftPick(leagueId: LeagueId, draftId: string, pickNumber: number): Promise<void> {
    try {
      const draft = await this.loadLiveDraft(leagueId, draftId);
      if (!draft) {
        throw new Error(`Live draft ${draftId} not found in league ${leagueId}`);
      }

      const pickIndex = draft.picks.findIndex(p => p.pickNumber === pickNumber);
      if (pickIndex === -1) {
        throw new Error(`Pick ${pickNumber} not found in draft ${draftId}`);
      }

      draft.picks.splice(pickIndex, 1);
      await this.saveLiveDraft(leagueId, draft);
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to delete pick from live draft in memory',
        error,
        { operation: 'deleteLiveDraftPick', leagueId }
      );
    }
  }

  /**
   * Delete a complete live draft
   */
  async deleteLiveDraft(leagueId: LeagueId, draftId: string): Promise<void> {
    try {
      const drafts = await this.loadLiveDrafts(leagueId);
      const filteredDrafts = drafts.filter(d => d.draftId !== draftId);
      
      this.liveDrafts.set(leagueId, filteredDrafts);
      return Promise.resolve();
    } catch (error) {
      throw createStorageError(
        'DATA_ERROR',
        'Failed to delete live draft from memory',
        error,
        { operation: 'deleteLiveDraft', leagueId }
      );
    }
  }
} 