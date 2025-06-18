import { LeagueId, PlatformLeague } from '@/platforms/common';
import { StoredLeaguesDataCurrent } from '@/app/storage/savedLeagueTypes';
import { 
  StoredMocksDataCurrent, 
  StoredDraftDataCurrent,
  RosterSelections,
  EstimationSettingsState,
  SearchSettingsState
} from '@/app/storage/savedMockTypes';

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
 * Standardized error types for storage operations
 */
export interface StorageError extends Error {
  /** Error category for programmatic handling */
  code: StorageErrorCode;
  /** Human-readable error message */
  message: string;
  /** Original error from underlying storage system */
  originalError?: any;
  /** Additional context about the operation that failed */
  context?: StorageErrorContext;
}

/**
 * Categories of storage errors for handling different scenarios
 */
export type StorageErrorCode = 
  | 'NETWORK_ERROR'     // Network connectivity issues
  | 'AUTH_ERROR'        // Authentication/authorization failures
  | 'DATA_ERROR'        // Data validation or corruption issues
  | 'QUOTA_ERROR'       // Storage quota exceeded
  | 'PERMISSION_ERROR'  // Insufficient permissions
  | 'NOT_FOUND_ERROR'   // Requested resource not found
  | 'CONFLICT_ERROR'    // Data conflict (e.g., optimistic locking)
  | 'UNKNOWN_ERROR';    // Unexpected errors

/**
 * Additional context for storage errors
 */
export interface StorageErrorContext {
  /** The storage operation that failed */
  operation: string;
  /** League ID if applicable */
  leagueId?: LeagueId;
  /** Roster name if applicable */
  rosterName?: string;
  /** User ID if applicable */
  userId?: string;
  /** Timestamp when error occurred */
  timestamp: Date;
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
  type: 'localStorage' | 'supabase';
  /** Optional user ID for multi-user storage backends */
  userId?: string;
  /** Optional encryption key for sensitive data */
  encryptionKey?: string;
  /** Retry configuration for network operations */
  retryConfig?: {
    maxRetries: number;
    backoffMs: number;
  };
}

/**
 * Helper function to create a StorageError with proper typing
 */
export function createStorageError(
  code: StorageErrorCode,
  message: string,
  originalError?: any,
  context?: Partial<StorageErrorContext>
): StorageError {
  const error = new Error(message) as StorageError;
  error.code = code;
  error.originalError = originalError;
  error.context = {
    operation: 'unknown',
    timestamp: new Date(),
    ...context
  };
  error.name = 'StorageError';
  return error;
}

/**
 * Type guard to check if an error is a StorageError
 */
export function isStorageError(error: any): error is StorageError {
  return error instanceof Error && 
         'code' in error && 
         typeof error.code === 'string' &&
         error.name === 'StorageError';
} 