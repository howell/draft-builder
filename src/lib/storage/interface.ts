import { LeagueId, PlatformLeague } from '@/platforms/common';
import { 
  StoredLeaguesDataCurrent,
  StoredMocksDataCurrent, 
  StoredDraftDataCurrent,
  RosterSelections,
  EstimationSettingsState,
  SearchSettingsState
} from '@/types/storage';
import { LiveDraftState, LiveDraftPick } from '@/app/storage/savedLiveDraftTypes';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Categories of user-level (account) settings. Mirrors the Dexie `userSettings`
 * table's `type` column (src/lib/storage/database-schema.ts) and the Supabase
 * `user_settings.type` CHECK constraint.
 */
export type UserSettingType = 'estimation' | 'search' | 'display' | 'app';

/**
 * Storage abstraction interface that matches the current localStorage API
 * but with async methods for future Supabase integration.
 *
 * This interface ensures we can swap storage backends (localStorage -> Supabase)
 * without changing the calling code.
 */
export interface StorageAdapter {
  /**
   * Load a user-level setting blob by type + key, or undefined if unset.
   * Account-level preferences not tied to a single draft (e.g. per-league price
   * multipliers). For anonymous users this is local-only.
   */
  getUserSetting<T = unknown>(type: UserSettingType, key: string): Promise<T | undefined>;

  /**
   * Persist a user-level setting blob by type + key (upsert).
   */
  setUserSetting<T = unknown>(type: UserSettingType, key: string, data: T): Promise<void>;

  /**
   * Load all saved leagues for the current user
   * @returns Promise resolving to leagues data structure
   */
  loadLeagues(): Promise<StoredLeaguesDataCurrent>;

  /**
   * Save a league configuration
   * @param leagueId - The league identifier
   * @param league - The league configuration to save
   */
  saveLeague(leagueId: LeagueId, league: PlatformLeague): Promise<void>;

  /**
   * Load a single league by ID
   * @param leagueId - The league identifier
   * @returns Promise resolving to league or undefined if not found
   */
  loadLeague(leagueId: LeagueId): Promise<PlatformLeague | undefined>;

  /**
   * Load all saved mock drafts for a specific league
   * @param leagueId - The league identifier
   * @returns Promise resolving to mock drafts data structure
   */
  loadSavedMocks(leagueId: LeagueId): Promise<StoredMocksDataCurrent>;

  /**
   * Save mock draft data for a league
   * @param leagueId - The league identifier
   * @param data - The mock drafts data to save
   */
  saveMock(leagueId: LeagueId, data: StoredMocksDataCurrent): Promise<void>;

  /**
   * Load a specific draft by name within a league
   * @param leagueId - The league identifier
   * @param rosterName - The name of the roster/draft to load
   * @returns Promise resolving to draft data or undefined if not found
   */
  loadDraftByName(leagueId: LeagueId, rosterName: string): Promise<StoredDraftDataCurrent | undefined>;

  /**
   * Save a complete roster/draft configuration
   * @param leagueId - The league identifier
   * @param rosterName - The name of the roster/draft
   * @param rosterSelections - The player selections
   * @param costAdjustments - Manual cost adjustments
   * @param estimationSettings - Settings for cost estimation
   * @param searchSettings - Settings for player search
   * @param notes - Optional notes for the draft
   */
  saveSelectedRoster(
    leagueId: LeagueId,
    rosterName: string,
    rosterSelections: RosterSelections,
    costAdjustments: Record<string, number>,
    estimationSettings: EstimationSettingsState,
    searchSettings: SearchSettingsState,
    notes?: string
  ): Promise<void>;

  /**
   * Delete a specific roster/draft
   * @param leagueId - The league identifier
   * @param rosterName - The name of the roster/draft to delete
   */
  deleteRoster(leagueId: LeagueId, rosterName: string): Promise<void>;

  /**
   * Clear all data for the current user
   * This is used for data cleanup after migration or for testing
   */
  clearAllData(): Promise<void>;

  // Live Draft Methods
  
  /**
   * Load all live drafts for a specific league
   * @param leagueId - The league identifier
   * @returns Promise resolving to array of live draft states
   */
  loadLiveDrafts(leagueId: LeagueId): Promise<LiveDraftState[]>;

  /**
   * Load a specific live draft by ID
   * @param leagueId - The league identifier
   * @param draftId - The draft identifier
   * @returns Promise resolving to live draft state or undefined if not found
   */
  loadLiveDraft(leagueId: LeagueId, draftId: string): Promise<LiveDraftState | undefined>;

  /**
   * Save/create a live draft
   * @param leagueId - The league identifier
   * @param draftState - The complete draft state to save
   */
  saveLiveDraft(leagueId: LeagueId, draftState: LiveDraftState): Promise<void>;

  /**
   * Add a pick to a live draft
   * @param leagueId - The league identifier
   * @param draftId - The draft identifier
   * @param pick - The pick to add
   */
  addLiveDraftPick(leagueId: LeagueId, draftId: string, pick: LiveDraftPick): Promise<void>;

  /**
   * Update an existing pick in a live draft
   * @param leagueId - The league identifier
   * @param draftId - The draft identifier
   * @param pickNumber - The pick number to update
   * @param updatedPick - The updated pick data
   */
  updateLiveDraftPick(leagueId: LeagueId, draftId: string, pickNumber: number, updatedPick: LiveDraftPick): Promise<void>;

  /**
   * Delete a pick from a live draft
   * @param leagueId - The league identifier
   * @param draftId - The draft identifier
   * @param pickNumber - The pick number to delete
   */
  deleteLiveDraftPick(leagueId: LeagueId, draftId: string, pickNumber: number): Promise<void>;

  /**
   * Delete a complete live draft
   * @param leagueId - The league identifier
   * @param draftId - The draft identifier
   */
  deleteLiveDraft(leagueId: LeagueId, draftId: string): Promise<void>;
}

/**
 * Factory function type for creating storage adapters
 */
export type StorageAdapterFactory = () => StorageAdapter;

/**
 * Configuration for storage adapters
 */
export interface StorageConfig {
  /** Type of storage backend to use */
  type: 'localStorage' | 'supabase' | 'memory' | 'dexie';
  /** Supabase client for database operations (required for supabase type) */
  supabase?: SupabaseClient<Database>;
  /** User ID for multi-user storage backends (required for supabase and dexie types) */
  userId?: string;
  /** Optional encryption key for sensitive data */
  encryptionKey?: string;
  /** Fallback storage type when primary storage fails (mainly for Supabase -> Dexie) */
  fallback?: 'localStorage' | 'dexie' | 'memory';
  /** Retry configuration for network operations */
  retryConfig?: {
    maxRetries: number;
    backoffMs: number;
  };
}

// Re-export error types and utilities from errors module
export type { StorageErrorCode, StorageErrorContext } from './errors';
export { StorageError, createStorageError, isStorageError } from './errors'; 