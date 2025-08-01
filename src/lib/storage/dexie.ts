/**
 * Dexie Storage Adapter
 * 
 * IndexedDB storage implementation using Dexie.js that provides:
 * - Normalized database schema with relationships
 * - Full StorageAdapter interface compliance
 * - ESPN auth encryption/decryption
 * - Transaction-based operations
 * - Comprehensive error handling
 */

import { LeagueId, PlatformLeague } from '@/platforms/common';
import { StorageAdapter, createStorageError } from './interface';
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
import { encryptEspnAuth, decryptEspnAuth, EspnAuth } from '@/lib/encryption/utils';

/**
 * DexieStorageAdapter implements the StorageAdapter interface using IndexedDB via Dexie.js
 * 
 * Key Features:
 * - Normalized database schema for better performance
 * - Automatic timestamp management
 * - Transaction support for data integrity
 * - ESPN auth encryption
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

  // =============================================================================
  // LEAGUE OPERATIONS
  // =============================================================================

  async loadLeagues(): Promise<StoredLeaguesDataCurrent> {
    try {
      if (!this.isClient) {
        return { schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION, leagues: {} };
      }

      const leagues = await queries.leagues(this.userId).all();
      const leaguesMap: { [leagueId: LeagueId]: PlatformLeague } = {};

      for (const league of leagues) {
        const platformLeague: PlatformLeague = {
          platform: league.platform,
          id: league.metadata?.originalId || league.leagueId // Use stored original ID if available
        };

        // Decrypt auth data if present
        if (league.authDataEncrypted && league.platform === 'espn') {
          try {
            const decrypted = await this.decryptEspnAuthData(league.authDataEncrypted);
            (platformLeague as any).auth = decrypted;
          } catch (error) {
            console.warn(`Failed to decrypt auth data for league ${league.leagueId}:`, error);
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

      // Handle ESPN auth encryption
      if (league.platform === 'espn' && (league as any).auth) {
        try {
          leagueData.authDataEncrypted = await this.encryptEspnAuthData((league as any).auth);
        } catch (error) {
          console.warn('Failed to encrypt ESPN auth data:', error);
        }
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
    try {
      if (!this.isClient) return {};

      // Get league database ID
      const league = await db.leagues
        .where('userId')
        .equals(this.userId)
        .and(l => l.leagueId === leagueId)
        .first();

      if (!league) return {};

      // Get all drafts for this league
      const drafts = await queries.drafts(this.userId).byLeague(league.id!);
      
      const mocksData: StoredMocksDataCurrent = {};

      // Convert each draft to the legacy format
      for (const draft of drafts) {
        const players = await queries.players(draft.id!).selected();
        
        const rosterSelections: RosterSelections = {};

        // Build roster selections from players
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
          
          rosterSelections[player.playerId] = rosterPlayer;
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

      return mocksData;
    } catch (error) {
      this.logError('loadSavedMocks', error, { leagueId, userId: this.userId });
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

      // Add new players
      const players: Player[] = Object.values(mockData.rosterSelections)
        .filter((player): player is NonNullable<typeof player> => player !== undefined)
        .map(player => ({
          draftId,
          playerId: player.id,
          name: player.name,
          position: player.defaultPosition,
          defaultPosition: player.defaultPosition,
          positions: player.positions,
          cost: player.estimatedCost,
          estimatedCost: player.estimatedCost,
          suggestedCost: player.suggestedCost,
          overallRank: player.overallRank,
          positionRank: player.positionRank,
          selected: true
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
  // PRIVATE HELPER METHODS
  // =============================================================================

  /**
   * Encrypt ESPN auth data for secure storage
   */
  private async encryptEspnAuthData(auth: any): Promise<string> {
    const espnAuth: EspnAuth = {
      cookies: typeof auth === 'string' ? auth : JSON.stringify(auth)
    };
    
    const encrypted = await encryptEspnAuth(espnAuth);
    return encrypted.toString('base64');
  }

  /**
   * Decrypt ESPN auth data from storage
   */
  private async decryptEspnAuthData(encryptedData: string): Promise<any> {
    const buffer = Buffer.from(encryptedData, 'base64');
    const decrypted = await decryptEspnAuth(buffer);
    
    try {
      return JSON.parse(decrypted.cookies);
    } catch {
      return decrypted.cookies;
    }
  }
}