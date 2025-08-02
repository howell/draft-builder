/**
 * Migration-related type definitions for user account data migration
 */

/**
 * Represents the current phase of migration
 */
export type MigrationPhase = 
  | 'export'      // Exporting data from localStorage
  | 'transform'   // Transforming data for database format
  | 'validate'    // Validating transformed data
  | 'upload'      // Uploading data to Supabase
  | 'verify'      // Verifying uploaded data integrity
  | 'complete';   // Migration completed successfully

/**
 * Progress information for migration process
 */
export interface MigrationProgress {
  /** Current phase of migration */
  phase: MigrationPhase;
  /** Progress percentage (0-100) */
  progress: number;
  /** Human-readable message describing current operation */
  message: string;
  /** Error message if migration failed */
  error?: string;
}

/**
 * Result of a completed migration attempt
 */
export interface MigrationResult {
  /** Whether the migration completed successfully */
  success: boolean;
  /** Number of leagues successfully migrated */
  migratedLeagues?: number;
  /** Number of draft sessions successfully migrated */
  migratedDrafts?: number;
  /** Unique identifier for this migration attempt */
  migrationId?: string;
  /** Error message if migration failed */
  error?: string;
  /** Timestamp when migration started */
  startTime?: Date;
  /** Timestamp when migration completed */
  endTime?: Date;
  /** Duration of migration in milliseconds */
  duration?: number;
}

/**
 * Configuration options for migration service
 */
export interface MigrationOptions {
  /** Whether to perform dry run (validate without uploading) */
  dryRun?: boolean;
  /** Whether to clear localStorage after successful migration */
  clearLocalStorageAfterMigration?: boolean;
  /** Maximum time to wait for migration in milliseconds */
  timeoutMs?: number;
  /** Whether to attempt rollback on failure */
  enableRollback?: boolean;
}

/**
 * Summary of data to be migrated
 */
export interface MigrationDataSummary {
  /** Number of leagues to migrate */
  leagueCount: number;
  /** Number of draft sessions to migrate */
  draftCount: number;
  /** Total number of player selections across all drafts */
  totalSelections: number;
  /** Number of cost adjustments to migrate */
  costAdjustments: number;
  /** Estimated size of data in bytes */
  estimatedSizeBytes?: number;
  /** Whether any ESPN authentication data is present */
  hasEspnAuthData?: boolean;
}

/**
 * Error class for migration-specific errors
 */
export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
    public readonly phase?: MigrationPhase,
    public readonly migrationId?: string
  ) {
    super(message);
    this.name = 'MigrationError';
    
    // Maintain proper prototype chain
    Object.setPrototypeOf(this, MigrationError.prototype);
  }
}

/**
 * Status of migration rollback operation
 */
export interface RollbackResult {
  /** Whether rollback completed successfully */
  success: boolean;
  /** Error message if rollback failed */
  error?: string;
  /** List of operations that were rolled back */
  rolledBackOperations?: string[];
}

/**
 * Detailed migration statistics for monitoring and analytics
 */
export interface MigrationStatistics {
  /** Migration ID for tracking */
  migrationId: string;
  /** User ID who performed the migration */
  userId: string;
  /** Timestamp when migration started */
  startTime: Date;
  /** Timestamp when migration completed (success or failure) */
  endTime?: Date;
  /** Total duration in milliseconds */
  duration?: number;
  /** Number of items processed by type */
  itemsProcessed: {
    leagues: number;
    draftSessions: number;
    playerSelections: number;
    costAdjustments: number;
    espnAuthRecords: number;
  };
  /** Whether migration completed successfully */
  success: boolean;
  /** Error information if migration failed */
  error?: {
    message: string;
    phase: MigrationPhase;
    stack?: string;
  };
  /** Whether rollback was attempted */
  rollbackAttempted?: boolean;
  /** Result of rollback if attempted */
  rollbackResult?: RollbackResult;
}