/**
 * Dexie Storage Adapter
 * 
 * IndexedDB storage implementation using Dexie.js that provides:
 * - Normalized database schema with relationships
 * - Full StorageAdapter interface compliance
 * - Unencrypted client-side storage
 * - Transaction-based operations
 * - Comprehensive error handling
 */

import { LeagueId, PlatformLeague } from '@/platforms/common';
import { StorageAdapter, UserSettingType, createStorageError } from './interface';
import { LiveDraftState, LiveDraftPick } from '@/app/storage/savedLiveDraftTypes';
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
import { db, queries, League, Draft, Player } from './database-schema';

/**
 * DexieStorageAdapter implements the StorageAdapter interface using IndexedDB via Dexie.js
 * 
 * Key Features:
 * - Normalized database schema for better performance
 * - Automatic timestamp management
 * - Transaction support for data integrity
 * - ESPN auth storage as JSON
 * - User data isolation
 */
export class DexieStorageAdapter implements StorageAdapter {
  private readonly userId: string;
  private readonly isClient = typeof window !== 'undefined';

  constructor(userId: string = 'anonymous') {
    this.userId = userId;
  }

  /**
   * Log errors consistently for Dexie operations
   */
  private logError(operation: string, error: any, context?: any): void {
    console.error(`[Dexie] Error in ${operation}:`, error);
    if (context) {
      console.error(`[Dexie] Context:`, context);
    }
  }

  /**
   * Convert date strings back to Date objects when deserializing live draft data
   */
  private deserializeLiveDraftState(data: string): LiveDraftState {
    const parsed = JSON.parse(data) as LiveDraftState;
    
    // Convert pick timestamps from strings to Date objects
    if (parsed.picks) {
      parsed.picks.forEach(pick => {
        if (typeof pick.timestamp === 'string') {
          pick.timestamp = new Date(pick.timestamp);
        }
      });
    }
    
    return parsed;
  }

  // =============================================================================
  // USER SETTINGS OPERATIONS
  // =============================================================================

  async getUserSetting<T = unknown>(type: UserSettingType, key: string): Promise<T | undefined> {
    try {
      if (!this.isClient) return undefined;

      if (!db.isOpen()) {
        await db.open();
      }

      const setting = await db.getUserSetting(this.userId, type, key);
      return setting?.data as T | undefined;
    } catch (error) {
      this.logError('getUserSetting', error, { type, key, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load user setting from IndexedDB',
        error,
        { operation: 'getUserSetting', userId: this.userId }
      );
    }
  }

  async setUserSetting<T = unknown>(type: UserSettingType, key: string, data: T): Promise<void> {
    try {
      if (!this.isClient) return;

      if (!db.isOpen()) {
        await db.open();
      }

      await db.setUserSetting(this.userId, type, key, data);
    } catch (error) {
      this.logError('setUserSetting', error, { type, key, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save user setting to IndexedDB',
        error,
        { operation: 'setUserSetting', userId: this.userId }
      );
    }
  }

  // =============================================================================
  // LEAGUE OPERATIONS
  // =============================================================================

  async loadLeagues(): Promise<StoredLeaguesDataCurrent> {
    try {
      if (!this.isClient) {
        return { schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION, leagues: {} };
      }

      // Check if database is open
      if (!db.isOpen()) {
        await db.open();
      }
      
      const leagues = await db.getLeaguesForUser(this.userId);
      console.log(`[DexieAdapter] Found ${leagues.length} leagues for user ${this.userId}`);
      
      const leaguesMap: { [leagueId: LeagueId]: PlatformLeague } = {};

      for (const league of leagues) {
        const platformLeague: PlatformLeague = {
          platform: league.platform,
          id: league.metadata?.originalId || league.leagueId // Use stored original ID if available
        };

        // Deserialize auth data if present (unencrypted client-side storage)
        if (league.authDataEncrypted && league.platform === 'espn') {
          try {
            const deserialized = this.deserializeEspnAuthData(league.authDataEncrypted);
            (platformLeague as any).auth = deserialized;
          } catch (error) {
            console.warn(`Failed to deserialize auth data for league ${league.leagueId}:`, error);
          }
        }

        leaguesMap[league.leagueId] = platformLeague;
      }

      return {
        schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
        leagues: leaguesMap
      };
    } catch (error) {
      this.logError('loadLeagues', error);
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load leagues from IndexedDB',
        error,
        { operation: 'loadLeagues', userId: this.userId }
      );
    }
  }

  async saveLeague(leagueId: LeagueId, league: PlatformLeague): Promise<void> {
    try {
      if (!this.isClient) return;

      // Check if league already exists
      const existing = await db.leagues
        .where('userId')
        .equals(this.userId)
        .and(l => l.leagueId === leagueId)
        .first();

      const leagueData: Partial<League> = {
        userId: this.userId,
        platform: league.platform,
        leagueId: leagueId, // Use the leagueId parameter as the storage key
        metadata: {
          originalId: league.id // Store the original league ID
        }
      };

      // Handle ESPN auth serialization (unencrypted client-side storage)
      if (league.platform === 'espn' && (league as any).auth) {
        try {
          leagueData.authDataEncrypted = this.serializeEspnAuthData((league as any).auth);
        } catch (error) {
          console.warn('Failed to serialize ESPN auth data:', error);
        }
      } else if (league.platform === 'espn') {
        // Explicitly clear auth data if ESPN league has no auth
        leagueData.authDataEncrypted = undefined;
      }

      if (existing) {
        // Update existing league
        await db.leagues.update(existing.id!, {
          ...leagueData,
          updatedAt: new Date()
        });
      } else {
        // Create new league
        await db.leagues.add({
          ...leagueData,
          favorite: false,
          createdAt: new Date(),
          updatedAt: new Date()
        } as League);
      }
    } catch (error) {
      this.logError('saveLeague', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save league to IndexedDB',
        error,
        { operation: 'saveLeague', leagueId, userId: this.userId }
      );
    }
  }

  async loadLeague(leagueId: LeagueId): Promise<PlatformLeague | undefined> {
    try {
      const leagues = await this.loadLeagues();
      return leagues.leagues[leagueId];
    } catch (error) {
      this.logError('loadLeague', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load league from IndexedDB',
        error,
        { operation: 'loadLeague', leagueId, userId: this.userId }
      );
    }
  }

  // =============================================================================
  // DRAFT/MOCK OPERATIONS
  // =============================================================================

  async loadSavedMocks(leagueId: LeagueId): Promise<StoredMocksDataCurrent> {
    console.log('[DexieStorageAdapter.loadSavedMocks] Loading mocks for league:', leagueId);
    try {
      if (!this.isClient) {
        console.warn('[DexieStorageAdapter.loadSavedMocks] Not in client environment, skipping data clear');
        return {};
      }

      // Get league database ID
      const league = await db.leagues
        .where('userId')
        .equals(this.userId)
        .and(l => l.leagueId === leagueId)
        .first();

      if (!league) {
        console.warn('[DexieStorageAdapter.loadSavedMocks] League not found, skipping data load');
        return {};
      }

      // Get all drafts for this league
      const drafts = await queries.drafts(this.userId).byLeague(league.id!);
      
      const mocksData: StoredMocksDataCurrent = {};

      // Convert each draft to the legacy format
      for (const draft of drafts) {
        const players = await queries.players(draft.id!).selected();
        
        const rosterSelections: RosterSelections = {};

        // Build roster selections from players using original roster slot keys
        for (const player of players) {
          const rosterPlayer: any = {
            id: player.playerId,
            name: player.name,
            defaultPosition: player.defaultPosition,
            positions: player.positions,
            overallRank: player.overallRank,
            positionRank: player.positionRank,
            estimatedCost: player.estimatedCost
          };
          
          // Only include suggestedCost if it exists and is not undefined
          if (player.suggestedCost !== undefined) {
            rosterPlayer.suggestedCost = player.suggestedCost;
          }
          
          // Use the stored roster slot key for proper MockTable mapping
          rosterSelections[player.rosterSlotKey] = rosterPlayer;
        }

        mocksData[draft.name] = {
          year: draft.year,
          created: draft.createdAt instanceof Date ? draft.createdAt.getTime() : new Date(draft.createdAt).getTime(),
          modified: draft.updatedAt instanceof Date ? draft.updatedAt.getTime() : new Date(draft.updatedAt).getTime(),
          rosterSelections,
          costAdjustments: draft.costAdjustments || {},
          estimationSettings: draft.estimationSettings,
          searchSettings: draft.searchSettings,
          notes: draft.notes || ''
        };
      }

      console.log('[DexieStorageAdapter.loadSavedMocks] Loaded mocks:', mocksData);
      return mocksData;
    } catch (error) {
      this.logError('[DexieStorageAdapter.loadSavedMocks] Error loading mocks', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load saved mocks from IndexedDB',
        error,
        { operation: 'loadSavedMocks', leagueId, userId: this.userId }
      );
    }
  }

  async saveMock(leagueId: LeagueId, data: StoredMocksDataCurrent): Promise<void> {
    try {
      if (!this.isClient) return;

      // Get or create league
      let league = await db.leagues
        .where('userId')
        .equals(this.userId)
        .and(l => l.leagueId === leagueId)
        .first();

      if (!league) {
        // Create league if it doesn't exist
        const leagueDbId = await db.leagues.add({
          userId: this.userId,
          platform: 'sleeper', // Default platform
          leagueId,
          favorite: false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        league = await db.leagues.get(leagueDbId);
      }

      // Save each mock draft
      for (const [mockName, mockData] of Object.entries(data)) {
        await this.saveSingleMock(league!.id!, mockName, mockData);
      }
    } catch (error) {
      this.logError('saveMock', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save mock to IndexedDB',
        error,
        { operation: 'saveMock', leagueId, userId: this.userId }
      );
    }
  }

  private async saveSingleMock(leagueDbId: number, mockName: string, mockData: StoredDraftDataCurrent): Promise<void> {
    await db.transaction('rw', db.drafts, db.players, async () => {
      // Check if draft already exists
      const existingDraft = await db.drafts
        .where('leagueId')
        .equals(leagueDbId)
        .and(d => d.userId === this.userId && d.name === mockName)
        .first();

      let draftId: number;

      if (existingDraft) {
        // Update existing draft
        await db.drafts.update(existingDraft.id!, {
          year: mockData.year,
          notes: mockData.notes,
          estimationSettings: mockData.estimationSettings,
          searchSettings: mockData.searchSettings,
          costAdjustments: mockData.costAdjustments,
          updatedAt: new Date(mockData.modified)
        });
        draftId = existingDraft.id!;
      } else {
        // Create new draft
        draftId = await db.drafts.add({
          leagueId: leagueDbId,
          userId: this.userId,
          name: mockName,
          year: mockData.year,
          notes: mockData.notes,
          estimationSettings: mockData.estimationSettings,
          searchSettings: mockData.searchSettings,
          costAdjustments: mockData.costAdjustments,
          isTemplate: false,
          createdAt: new Date(mockData.created),
          updatedAt: new Date(mockData.modified)
        });
      }

      // Clear existing players for this draft
      await db.players.where('draftId').equals(draftId).delete();

      // Add new players with roster slot keys preserved
      const players: Player[] = Object.entries(mockData.rosterSelections)
        .filter(([key, player]) => player !== undefined)
        .map(([rosterSlotKey, player]) => ({
          draftId,
          playerId: player!.id,
          name: player!.name,
          position: player!.defaultPosition,
          defaultPosition: player!.defaultPosition,
          positions: player!.positions,
          cost: player!.estimatedCost,
          estimatedCost: player!.estimatedCost,
          suggestedCost: player!.suggestedCost,
          overallRank: player!.overallRank,
          positionRank: player!.positionRank,
          selected: true,
          rosterSlotKey // Store the roster slot key for proper reconstruction
        }));

      if (players.length > 0) {
        await db.players.bulkAdd(players);
      }
    });
  }

  async loadDraftByName(leagueId: LeagueId, rosterName: string): Promise<StoredDraftDataCurrent | undefined> {
    try {
      const mocks = await this.loadSavedMocks(leagueId);
      return mocks[rosterName];
    } catch (error) {
      this.logError('loadDraftByName', error, { leagueId, rosterName, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load draft by name from IndexedDB',
        error,
        { operation: 'loadDraftByName', leagueId, rosterName, userId: this.userId }
      );
    }
  }

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

      const mockData: StoredDraftDataCurrent = {
        year: CURRENT_SEASON,
        created: Date.now(),
        modified: Date.now(),
        rosterSelections,
        costAdjustments,
        estimationSettings,
        searchSettings,
        notes
      };

      await this.saveMock(leagueId, { [rosterName]: mockData });
    } catch (error) {
      this.logError('saveSelectedRoster', error, { leagueId, rosterName, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save selected roster to IndexedDB',
        error,
        { operation: 'saveSelectedRoster', leagueId, rosterName, userId: this.userId }
      );
    }
  }

  async deleteRoster(leagueId: LeagueId, rosterName: string): Promise<void> {
    try {
      if (!this.isClient) return;

      // Get league
      const league = await db.leagues
        .where('userId')
        .equals(this.userId)
        .and(l => l.leagueId === leagueId)
        .first();

      if (!league) return;

      // Get draft
      const draft = await db.drafts
        .where('leagueId')
        .equals(league.id!)
        .and(d => d.userId === this.userId && d.name === rosterName)
        .first();

      if (!draft) return;

      await db.transaction('rw', db.drafts, db.players, async () => {
        // Delete players
        await db.players.where('draftId').equals(draft.id!).delete();
        
        // Delete draft
        await db.drafts.delete(draft.id!);
      });
    } catch (error) {
      this.logError('deleteRoster', error, { leagueId, rosterName, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to delete roster from IndexedDB',
        error,
        { operation: 'deleteRoster', leagueId, rosterName, userId: this.userId }
      );
    }
  }

  // =============================================================================
  // DATA MANAGEMENT
  // =============================================================================

  /**
   * Clear all data for the current user
   * This removes all leagues, drafts, and associated data from IndexedDB
   */
  async clearAllData(): Promise<void> {
    try {
      console.log(`[DexieAdapter] Clearing all data for user: ${this.userId}`);
      
      if (!this.isClient) {
        console.log('[DexieAdapter] Not in client environment, skipping data clear');
        return;
      }

      // Check if database is open
      if (!db.isOpen()) {
        await db.open();
      }

      // Get all data for this user first for logging
      const leagues = await db.getLeaguesForUser(this.userId);
      const drafts = await db.getDraftsForUser(this.userId);
      console.log(`[DexieAdapter] Clearing ${leagues.length} leagues and ${drafts.length} drafts for user ${this.userId}`);

      // Use transaction to ensure atomicity. `db.settings` must appear in this
      // argument list, not just in the body — Dexie throws NotFoundError for a
      // table outside the transaction's scope, and callers such as
      // clearDexieDataAfterMigration swallow that silently.
      await db.transaction('rw', db.leagues, db.drafts, db.players, db.settings, async () => {
        // Delete all player selections for user's drafts
        const draftIds = drafts.map(d => d.id).filter((id): id is number => id !== undefined);
        if (draftIds.length > 0) {
          await db.players.where('draftId').anyOf(draftIds).delete();
        }

        // Delete all drafts for this user
        await db.drafts.where('userId').equals(this.userId).delete();

        // Delete all leagues for this user
        await db.leagues.where('userId').equals(this.userId).delete();

        // Settings live outside the league/draft graph, so they were previously
        // left behind entirely — anonymous rankings and price multipliers
        // survived both "Delete Local Data" and a completed migration.
        await db.settings.where('userId').equals(this.userId).delete();
      });

      console.log(`[DexieAdapter] ✅ Successfully cleared all data for user: ${this.userId}`);
    } catch (error) {
      this.logError('clearAllData', error, { userId: this.userId });
      throw createStorageError('DATA_ERROR', 'Failed to clear all user data', error, 
        { operation: 'clearAllData', userId: this.userId });
    }
  }

  // =============================================================================
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Serialize ESPN auth data for client-side storage (no encryption needed)
   */
  private serializeEspnAuthData(auth: any): string {
    return JSON.stringify(auth);
  }

  /**
   * Deserialize ESPN auth data from client-side storage
   */
  private deserializeEspnAuthData(serializedData: string): any {
    try {
      return JSON.parse(serializedData);
    } catch (error) {
      console.warn('[DexieAdapter] Failed to deserialize auth data, returning as string:', error);
      return serializedData;
    }
  }

  // Live Draft Methods

  async loadLiveDrafts(leagueId: LeagueId): Promise<LiveDraftState[]> {
    try {
      if (!this.isClient) return [];

      // Get league
      const league = await db.leagues
        .where('userId')
        .equals(this.userId)
        .and(l => l.leagueId === leagueId)
        .first();

      if (!league || !league.id) return [];

      // For now, store as JSON in drafts table with a special type
      const liveDrafts = await db.drafts
        .where('leagueId')
        .equals(league.id)
        .and(d => d.userId === this.userId && d.draftType === 'live')
        .toArray();

      return liveDrafts.map(draft => this.deserializeLiveDraftState(draft.data || '{}'));
    } catch (error) {
      this.logError('loadLiveDrafts', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load live drafts from IndexedDB',
        error,
        { operation: 'loadLiveDrafts', leagueId, userId: this.userId }
      );
    }
  }

  async loadLiveDraft(leagueId: LeagueId, draftId: string): Promise<LiveDraftState | undefined> {
    try {
      const drafts = await this.loadLiveDrafts(leagueId);
      return drafts.find(d => d.draftId === draftId);
    } catch (error) {
      this.logError('loadLiveDraft', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to load live draft from IndexedDB',
        error,
        { operation: 'loadLiveDraft', leagueId, userId: this.userId }
      );
    }
  }

  async saveLiveDraft(leagueId: LeagueId, draftState: LiveDraftState): Promise<void> {
    try {
      if (!this.isClient) return;

      // Get league
      const league = await db.leagues
        .where('userId')
        .equals(this.userId)
        .and(l => l.leagueId === leagueId)
        .first();

      if (!league || !league.id) {
        throw new Error(`League ${leagueId} not found for user ${this.userId}`);
      }

      // Check if draft already exists - use explicit filtering for reliability
      const allDrafts = await db.drafts
        .where('leagueId')
        .equals(league.id)
        .toArray();
      
      const existingDraft = allDrafts.find(d => 
        d.userId === this.userId && 
        d.name === draftState.draftId && 
        d.draftType === 'live'
      );

      const draftData: Partial<Draft> = {
        leagueId: league.id,
        userId: this.userId,
        name: draftState.draftId,
        year: draftState.settings.estimationSettings.years[0] || '2024',
        notes: '',
        estimationSettings: draftState.settings.estimationSettings,
        searchSettings: draftState.settings.searchSettings,
        costAdjustments: {},
        isTemplate: false,
        draftType: 'live' as const,
        data: JSON.stringify(draftState),
        created: existingDraft?.created || Date.now(),
        modified: Date.now()
      };

      if (existingDraft) {
        await db.drafts.update(existingDraft.id!, draftData);
      } else {
        await db.drafts.add(draftData as Draft);
      }
    } catch (error) {
      this.logError('saveLiveDraft', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to save live draft to IndexedDB',
        error,
        { operation: 'saveLiveDraft', leagueId, userId: this.userId }
      );
    }
  }

  async addLiveDraftPick(leagueId: LeagueId, draftId: string, pick: LiveDraftPick): Promise<void> {
    try {
      const draft = await this.loadLiveDraft(leagueId, draftId);
      if (!draft) {
        throw new Error(`Live draft ${draftId} not found in league ${leagueId}`);
      }

      draft.picks.push(pick);
      draft.currentPickNumber = Math.max(draft.currentPickNumber, pick.pickNumber + 1);
      await this.saveLiveDraft(leagueId, draft);
    } catch (error) {
      this.logError('addLiveDraftPick', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to add pick to live draft in IndexedDB',
        error,
        { operation: 'addLiveDraftPick', leagueId, userId: this.userId }
      );
    }
  }

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

      draft.picks[pickIndex] = updatedPick;
      await this.saveLiveDraft(leagueId, draft);
    } catch (error) {
      this.logError('updateLiveDraftPick', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to update pick in live draft in IndexedDB',
        error,
        { operation: 'updateLiveDraftPick', leagueId, userId: this.userId }
      );
    }
  }

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
      this.logError('deleteLiveDraftPick', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to delete pick from live draft in IndexedDB',
        error,
        { operation: 'deleteLiveDraftPick', leagueId, userId: this.userId }
      );
    }
  }

  async deleteLiveDraft(leagueId: LeagueId, draftId: string): Promise<void> {
    try {
      if (!this.isClient) return;

      // Get league
      const league = await db.leagues
        .where('userId')
        .equals(this.userId)
        .and(l => l.leagueId === leagueId)
        .first();

      if (!league || !league.id) return;

      // Delete the live draft
      await db.drafts
        .where('leagueId')
        .equals(league.id)
        .and(d => d.userId === this.userId && d.name === draftId && d.draftType === 'live')
        .delete();
    } catch (error) {
      this.logError('deleteLiveDraft', error, { leagueId, userId: this.userId });
      throw createStorageError(
        'DATA_ERROR',
        'Failed to delete live draft from IndexedDB',
        error,
        { operation: 'deleteLiveDraft', leagueId, userId: this.userId }
      );
    }
  }
}