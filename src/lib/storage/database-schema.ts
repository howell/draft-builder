/**
 * Dexie Database Schema Design
 * 
 * This file defines the complete database schema for the Draft Builder application
 * using Dexie.js. The schema is designed for optimal performance and data integrity.
 */

import Dexie, { Table } from 'dexie';
import type { Platform, LeagueId, SeasonId } from '@/platforms/common';
import type { EstimationSettingsStateV4, SearchSettingsState } from '@/types/storage';

// =============================================================================
// CORE INTERFACES
// =============================================================================

export interface League {
  id?: number;
  userId: string;
  platform: Platform;
  leagueId: LeagueId;
  authDataEncrypted?: string; // Encrypted ESPN auth data
  metadata?: {
    name?: string;
    teams?: number;
    scoringType?: string;
    lastSync?: Date;
  };
  favorite?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Draft {
  id?: number;
  leagueId: number; // Foreign key to leagues.id
  userId: string;
  name: string;
  year: SeasonId;
  notes: string;
  estimationSettings: EstimationSettingsStateV4;
  searchSettings: SearchSettingsState;
  costAdjustments: Record<string, number>;
  metadata?: {
    totalCost?: number;
    playerCount?: number;
    lastModified?: Date;
  };
  isTemplate: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Player {
  id?: number;
  draftId: number; // Foreign key to drafts.id
  playerId: string; // External player ID from platform
  name: string;
  position: string;
  defaultPosition: string;
  positions: string[];
  cost: number;
  estimatedCost: number;
  suggestedCost?: number;
  overallRank: number;
  positionRank: number;
  selected: boolean;
  metadata?: {
    platformSpecific?: any;
    notes?: string;
  };
}

export interface UserSettings {
  id?: number;
  userId: string;
  type: 'estimation' | 'search' | 'display' | 'app';
  key: string; // Settings key (e.g., 'defaultEstimationSettings')
  data: any; // JSON data for the setting
  updatedAt: Date;
}

export interface AppMetadata {
  id?: number;
  key: string; // Metadata key (e.g., 'lastCleanup', 'dbVersion')
  value: any; // JSON value
  updatedAt: Date;
}

// =============================================================================
// DATABASE CLASS
// =============================================================================

export class DraftBuilderDB extends Dexie {
  // Table definitions
  leagues!: Table<League>;
  drafts!: Table<Draft>;
  players!: Table<Player>;
  userSettings!: Table<UserSettings>;
  appMetadata!: Table<AppMetadata>;

  constructor() {
    super('DraftBuilderDB');

    // Version 1: Initial schema
    this.version(1).stores({
      leagues: '++id, userId, platform, leagueId, favorite, createdAt, updatedAt, [userId+leagueId]',
      drafts: '++id, leagueId, userId, name, year, isTemplate, createdAt, updatedAt, [leagueId+userId], [userId+name]',
      players: '++id, draftId, playerId, name, position, selected, overallRank, positionRank, [draftId+selected]',
      userSettings: '++id, userId, type, key, updatedAt, [userId+type+key]',
      appMetadata: '++id, key, updatedAt'
    });

    // Define hooks for automatic timestamp updates
    this.leagues.hook('creating', (primKey, obj, trans) => {
      (obj as any).createdAt = new Date();
      (obj as any).updatedAt = new Date();
    });

    this.leagues.hook('updating', (modifications, primKey, obj, trans) => {
      (modifications as any).updatedAt = new Date();
    });

    this.drafts.hook('creating', (primKey, obj, trans) => {
      (obj as any).createdAt = new Date();
      (obj as any).updatedAt = new Date();
    });

    this.drafts.hook('updating', (modifications, primKey, obj, trans) => {
      (modifications as any).updatedAt = new Date();
    });

    this.userSettings.hook('creating', (primKey, obj, trans) => {
      (obj as any).updatedAt = new Date();
    });

    this.userSettings.hook('updating', (modifications, primKey, obj, trans) => {
      (modifications as any).updatedAt = new Date();
    });

    this.appMetadata.hook('creating', (primKey, obj, trans) => {
      (obj as any).updatedAt = new Date();
    });

    this.appMetadata.hook('updating', (modifications, primKey, obj, trans) => {
      (modifications as any).updatedAt = new Date();
    });
  }

  // =============================================================================
  // UTILITY METHODS
  // =============================================================================

  /**
   * Get all leagues for a specific user
   */
  async getLeaguesForUser(userId: string): Promise<League[]> {
    return this.leagues
      .where('userId')
      .equals(userId)
      .reverse()
      .sortBy('updatedAt');
  }

  /**
   * Get all drafts for a specific league
   */
  async getDraftsForLeague(leagueId: number, userId: string): Promise<Draft[]> {
    return this.drafts
      .where(['leagueId', 'userId'])
      .equals([leagueId, userId])
      .reverse()
      .sortBy('updatedAt');
  }

  /**
   * Get all players for a specific draft
   */
  async getPlayersForDraft(draftId: number): Promise<Player[]> {
    return this.players
      .where('draftId')
      .equals(draftId)
      .sortBy('overallRank');
  }

  /**
   * Get selected players for a draft (roster)
   */
  async getSelectedPlayersForDraft(draftId: number): Promise<Player[]> {
    return this.players
      .where('draftId')
      .equals(draftId)
      .filter(p => p.selected)
      .sortBy('overallRank');
  }

  /**
   * Search players by name or position
   */
  async searchPlayers(draftId: number, query: string, position?: string): Promise<Player[]> {
    let collection = this.players.where('draftId').equals(draftId);
    
    if (position) {
      collection = collection.and(player => player.positions.includes(position));
    }
    
    if (query) {
      collection = collection.and(player => 
        player.name.toLowerCase().includes(query.toLowerCase())
      );
    }
    
    return collection.sortBy('overallRank');
  }

  /**
   * Get user setting by type and key
   */
  async getUserSetting(userId: string, type: string, key: string): Promise<UserSettings | undefined> {
    return this.userSettings
      .where(['userId', 'type', 'key'])
      .equals([userId, type, key])
      .first();
  }

  /**
   * Set user setting
   */
  async setUserSetting(userId: string, type: 'estimation' | 'search' | 'display' | 'app', key: string, data: any): Promise<void> {
    await this.userSettings.put({
      userId,
      type,
      key,
      data,
      updatedAt: new Date()
    });
  }

  /**
   * Get app metadata value
   */
  async getAppMetadata(key: string): Promise<any> {
    const metadata = await this.appMetadata.where('key').equals(key).first();
    return metadata?.value;
  }

  /**
   * Set app metadata value
   */
  async setAppMetadata(key: string, value: any): Promise<void> {
    await this.appMetadata.put({
      key,
      value,
      updatedAt: new Date()
    });
  }

  // =============================================================================
  // MAINTENANCE METHODS
  // =============================================================================

  /**
   * Clean up old data based on retention policies
   */
  async cleanup(retentionDays: number = 90): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    await this.transaction('rw', this.drafts, this.players, async () => {
      // Find old drafts
      const oldDrafts = await this.drafts
        .where('updatedAt')
        .below(cutoffDate)
        .and(draft => !draft.isTemplate) // Keep templates
        .toArray();

      // Delete players for old drafts
      for (const draft of oldDrafts) {
        await this.players.where('draftId').equals(draft.id!).delete();
      }

      // Delete old drafts
      await this.drafts
        .where('updatedAt')
        .below(cutoffDate)
        .and(draft => !draft.isTemplate)
        .delete();
    });

    // Update last cleanup metadata
    await this.setAppMetadata('lastCleanup', new Date().toISOString());
  }

  /**
   * Get database statistics
   */
  async getStats(): Promise<{
    leagues: number;
    drafts: number;
    players: number;
    userSettings: number;
    totalSize: number;
  }> {
    const [leagueCount, draftCount, playerCount, settingsCount] = await Promise.all([
      this.leagues.count(),
      this.drafts.count(),
      this.players.count(),
      this.userSettings.count()
    ]);

    // Estimate size (rough calculation)
    const avgRecordSize = 1000; // bytes
    const totalSize = (leagueCount + draftCount + playerCount + settingsCount) * avgRecordSize;

    return {
      leagues: leagueCount,
      drafts: draftCount,
      players: playerCount,
      userSettings: settingsCount,
      totalSize
    };
  }

  /**
   * Export all data for a user
   */
  async exportUserData(userId: string): Promise<{
    leagues: League[];
    drafts: Draft[];
    players: Player[];
    userSettings: UserSettings[];
  }> {
    const leagues = await this.getLeaguesForUser(userId);
    const leagueIds = leagues.map(l => l.id!);
    
    const drafts = await this.drafts
      .where('leagueId')
      .anyOf(leagueIds)
      .and(draft => draft.userId === userId)
      .toArray();
    
    const draftIds = drafts.map(d => d.id!);
    
    const [players, userSettings] = await Promise.all([
      this.players.where('draftId').anyOf(draftIds).toArray(),
      this.userSettings.where('userId').equals(userId).toArray()
    ]);

    return { leagues, drafts, players, userSettings };
  }

  /**
   * Import user data (for migration or backup restore)
   */
  async importUserData(data: {
    leagues: League[];
    drafts: Draft[];
    players: Player[];
    userSettings: UserSettings[];
  }): Promise<void> {
    await this.transaction('rw', this.leagues, this.drafts, this.players, this.userSettings, async () => {
      // Clear IDs to allow auto-increment
      const cleanedLeagues = data.leagues.map(l => ({ ...l, id: undefined }));
      const cleanedDrafts = data.drafts.map(d => ({ ...d, id: undefined }));
      const cleanedPlayers = data.players.map(p => ({ ...p, id: undefined }));
      const cleanedSettings = data.userSettings.map(s => ({ ...s, id: undefined }));

      // Insert data
      await this.leagues.bulkAdd(cleanedLeagues);
      await this.drafts.bulkAdd(cleanedDrafts);
      await this.players.bulkAdd(cleanedPlayers);
      await this.userSettings.bulkAdd(cleanedSettings);
    });
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const db = new DraftBuilderDB();

// =============================================================================
// QUERY BUILDERS
// =============================================================================

/**
 * Fluent query builder for common operations
 */
export class DraftBuilderQueries {
  constructor(private db: DraftBuilderDB) {}

  leagues(userId: string) {
    return {
      all: () => this.db.getLeaguesForUser(userId),
      byPlatform: (platform: Platform) => 
        this.db.leagues.where('userId').equals(userId).filter(l => l.platform === platform).toArray(),
      favorites: () =>
        this.db.leagues.where('userId').equals(userId).filter(l => l.favorite === true).toArray()
    };
  }

  drafts(userId: string) {
    return {
      byLeague: (leagueId: number) => this.db.getDraftsForLeague(leagueId, userId),
      templates: () =>
        this.db.drafts.where('userId').equals(userId).filter(d => d.isTemplate === true).toArray(),
      recent: (limit: number = 10) =>
        this.db.drafts.where('userId').equals(userId)
        .reverse().sortBy('updatedAt').then(results => results.slice(0, limit))
    };
  }

  players(draftId: number) {
    return {
      all: () => this.db.getPlayersForDraft(draftId),
      selected: () => this.db.getSelectedPlayersForDraft(draftId),
      byPosition: (position: string) =>
        this.db.players.where('draftId').equals(draftId).filter(p => p.position === position).toArray(),
      search: (query: string, position?: string) =>
        this.db.searchPlayers(draftId, query, position)
    };
  }
}

export const queries = new DraftBuilderQueries(db);