import { LeagueId, PlatformLeague } from '@/platforms/common';
import { 
  StoredLeaguesDataCurrent,
  StoredMocksDataCurrent, 
  StoredDraftDataCurrent,
  RosterSelections,
  EstimationSettingsState,
  SearchSettingsState
} from '@/types/storage';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Storage abstraction interface that matches the current localStorage API
 * but with async methods for future Supabase integration.
 * 
 * This interface ensures we can swap storage backends (localStorage -> Supabase)
 * without changing the calling code.
 */
export interface StorageAdapter {
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