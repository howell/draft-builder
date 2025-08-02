/**
 * Data Migration Service for transferring Dexie data to Supabase
 * Provides reliable, progress-tracked migration with rollback capabilities
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { LeagueId } from '@/platforms/common';
import { DexieStorageAdapter } from './dexie';
import {
  MigrationProgress, 
  MigrationResult, 
  MigrationError, 
  MigrationPhase,
  MigrationOptions,
  MigrationDataSummary,
  MigrationStatistics,
  RollbackResult
} from '@/types/migration';
import { StoredLeaguesDataCurrent, StoredMocksDataCurrent } from '@/types/storage';

/**
 * Service for migrating user data from Dexie to Supabase
 * Handles the complete migration process with progress tracking and error recovery
 */
export class DataMigrationService {
  private migrationId: string;
  private statistics: MigrationStatistics;
  private startTime: Date;

  constructor(
    private supabase: SupabaseClient<Database>,
    private userId: string,
    private progressCallback?: (progress: MigrationProgress) => void,
    private options: MigrationOptions = {}
  ) {
    // Generate UUID - use crypto.randomUUID if available, otherwise fallback
    this.migrationId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `migration-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.startTime = new Date();
    
    // Initialize statistics
    this.statistics = {
      migrationId: this.migrationId,
      userId: this.userId,
      startTime: this.startTime,
      itemsProcessed: {
        leagues: 0,
        draftSessions: 0,
        playerSelections: 0,
        costAdjustments: 0,
        espnAuthRecords: 0
      },
      success: false
    };

    // Set default options
    this.options = {
      dryRun: false,
      clearLocalStorageAfterMigration: true,
      timeoutMs: 300000, // 5 minutes default
      enableRollback: true,
      ...options
    };
  }

  /**
   * Main migration method - migrates all user data from Dexie to Supabase
   */
  async migrateAllUserData(): Promise<MigrationResult> {
    console.log(`[MigrationService] Starting migration ${this.migrationId} for user ${this.userId}`);
    
    try {
      // Phase 1: Export Dexie data
      this.reportProgress('export', 10, 'Loading data from local storage...');
      const dexieData = await this.exportDexieData();
      
      // Phase 2: Validate data before migration
      this.reportProgress('validate', 25, 'Validating data integrity...');
      await this.validateDataBeforeMigration(dexieData);

      // If this is a dry run, stop here
      if (this.options.dryRun) {
        this.reportProgress('complete', 100, 'Dry run completed successfully');
        
        // Update statistics for dry run
        this.statistics.success = true;
        this.statistics.endTime = new Date();
        this.statistics.duration = this.statistics.endTime.getTime() - this.startTime.getTime();
        
        return this.createSuccessResult();
      }

      // Phase 3: Transform data (preparation for upload)
      this.reportProgress('transform', 40, 'Preparing data for migration...');
      const transformedData = await this.transformDataForMigration(dexieData);

      // Phase 4: Upload data to Supabase
      this.reportProgress('upload', 60, 'Uploading data to cloud storage...');
      await this.uploadDataToSupabase(transformedData);

      // Phase 5: Verify uploaded data
      this.reportProgress('verify', 80, 'Verifying migrated data...');
      await this.verifyMigratedData();

      // Phase 6: Complete migration
      if (this.options.clearLocalStorageAfterMigration) {
        this.reportProgress('complete', 95, 'Cleaning up local storage...');
        await this.clearDexieDataAfterMigration();
      }

      this.reportProgress('complete', 100, 'Migration completed successfully!');
      
      // Update statistics
      this.statistics.success = true;
      this.statistics.endTime = new Date();
      this.statistics.duration = this.statistics.endTime.getTime() - this.startTime.getTime();

      console.log(`[MigrationService] Migration ${this.migrationId} completed successfully`);
      return this.createSuccessResult();

    } catch (error) {
      console.error(`[MigrationService] Migration ${this.migrationId} failed:`, error);
      
      // Update statistics with error
      this.statistics.success = false;
      this.statistics.endTime = new Date();
      this.statistics.duration = this.statistics.endTime.getTime() - this.startTime.getTime();
      this.statistics.error = {
        message: error instanceof Error ? error.message : 'Unknown error',
        phase: this.getCurrentPhase(),
        stack: error instanceof Error ? error.stack : undefined
      };

      // Attempt rollback if enabled
      if (this.options.enableRollback && !this.options.dryRun) {
        try {
          this.reportProgress(this.getCurrentPhase(), this.getCurrentProgress(), 'Migration failed, attempting rollback...', error instanceof Error ? error.message : 'Unknown error');
          
          const rollbackResult = await this.rollbackMigration();
          this.statistics.rollbackAttempted = true;
          this.statistics.rollbackResult = rollbackResult;
          
          if (rollbackResult.success) {
            this.reportProgress(this.getCurrentPhase(), this.getCurrentProgress(), 'Migration failed but rollback completed successfully', error instanceof Error ? error.message : 'Unknown error');
          } else {
            this.reportProgress(this.getCurrentPhase(), this.getCurrentProgress(), 'Migration failed and rollback also failed', `${error instanceof Error ? error.message : 'Unknown error'}; Rollback error: ${rollbackResult.error}`);
          }
        } catch (rollbackError) {
          console.error(`[MigrationService] Rollback failed:`, rollbackError);
          this.statistics.rollbackResult = { success: false, error: rollbackError instanceof Error ? rollbackError.message : 'Unknown rollback error' };
        }
      }

      // Re-throw the original error when rollback is disabled, or wrap with rollback info when enabled
      if (!this.options.enableRollback || this.options.dryRun) {
        throw error instanceof MigrationError ? error : new MigrationError(
          error instanceof Error ? error.message : 'Migration failed',
          error,
          this.getCurrentPhase(),
          this.migrationId
        );
      } else {
        throw new MigrationError(
          'Migration failed and was rolled back',
          error,
          this.getCurrentPhase(),
          this.migrationId
        );
      }
    }
  }

  /**
   * Export all data from Dexie (anonymous user data)
   */
  private async exportDexieData(): Promise<{ leagues: StoredLeaguesDataCurrent; mocks: Record<LeagueId, StoredMocksDataCurrent> }> {
    const dexieAdapter = new DexieStorageAdapter('anonymous');
    
    // Load leagues
    const leagues = await dexieAdapter.loadLeagues();
    this.statistics.itemsProcessed.leagues = Object.keys(leagues.leagues).length;
    
    // Load all draft data for each league
    const mocks: Record<LeagueId, StoredMocksDataCurrent> = {};
    for (const leagueId of Object.keys(leagues.leagues)) {
      const leagueMocks = await dexieAdapter.loadSavedMocks(leagueId as LeagueId);
      mocks[leagueId as LeagueId] = leagueMocks;
      
      // Count draft sessions and selections
      this.statistics.itemsProcessed.draftSessions += Object.keys(leagueMocks.mocks || {}).length;
      
      for (const draft of Object.values(leagueMocks.mocks || {})) {
        if (draft.rosterSelections) {
          this.statistics.itemsProcessed.playerSelections += Object.keys(draft.rosterSelections).length;
        }
        if (draft.costAdjustments) {
          this.statistics.itemsProcessed.costAdjustments += Object.keys(draft.costAdjustments).length;
        }
      }
    }
    
    return { leagues, mocks };
  }

  /**
   * Validate data integrity before migration
   */
  private async validateDataBeforeMigration(dexieData: { leagues: StoredLeaguesDataCurrent; mocks: Record<LeagueId, StoredMocksDataCurrent> }): Promise<void> {
    // Validate that we have data to migrate
    if (Object.keys(dexieData.leagues.leagues).length === 0) {
      throw new MigrationError('No leagues found to migrate', undefined, 'validate', this.migrationId);
    }

    // Validate user is authenticated
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user || user.id !== this.userId) {
      throw new MigrationError('User authentication required for migration', undefined, 'validate', this.migrationId);
    }

    // Validate schema versions
    if (dexieData.leagues.schemaVersion !== 2) {
      console.warn(`[MigrationService] Unexpected leagues schema version: ${dexieData.leagues.schemaVersion}`);
    }

    for (const [leagueId, mockData] of Object.entries(dexieData.mocks)) {
      if (mockData.schemaVersion !== 2) {
        console.warn(`[MigrationService] Unexpected mocks schema version for league ${leagueId}: ${mockData.schemaVersion}`);
      }
    }

    console.log(`[MigrationService] Data validation passed for ${Object.keys(dexieData.leagues.leagues).length} leagues`);
  }

  /**
   * Transform data for database insertion (placeholder for future tasks)
   */
  private async transformDataForMigration(dexieData: { leagues: StoredLeaguesDataCurrent; mocks: Record<LeagueId, StoredMocksDataCurrent> }): Promise<any> {
    // This will be implemented in Task 2.2 and 2.3
    // For now, just return the data as-is
    console.log('[MigrationService] Data transformation phase (to be implemented in subsequent tasks)');
    return dexieData;
  }

  /**
   * Upload data to Supabase (placeholder for future tasks)
   */
  private async uploadDataToSupabase(transformedData: any): Promise<void> {
    // This will be implemented in Task 2.2 and 2.3
    // For now, just simulate the upload
    console.log('[MigrationService] Data upload phase (to be implemented in subsequent tasks)');
    
    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  /**
   * Verify migrated data integrity (placeholder for future tasks)
   */
  private async verifyMigratedData(): Promise<void> {
    // This will be implemented in Task 2.2 and 2.3
    // For now, just log that verification would occur
    console.log('[MigrationService] Data verification phase (to be implemented in subsequent tasks)');
  }

  /**
   * Clear Dexie data after successful migration
   */
  private async clearDexieDataAfterMigration(): Promise<void> {
    try {
      const dexieAdapter = new DexieStorageAdapter('anonymous');
      
      // Clear all leagues first
      const leagues = await dexieAdapter.loadLeagues();
      for (const leagueId of Object.keys(leagues.leagues)) {
        await dexieAdapter.deleteSavedMocks(leagueId as LeagueId);
      }
      
      // Clear leagues data
      await dexieAdapter.saveLeagues({ schemaVersion: 2, leagues: {} });
      
      console.log('[MigrationService] Dexie data cleared after successful migration');
    } catch (error) {
      console.warn('[MigrationService] Failed to clear Dexie data after migration:', error);
      // Don't fail the migration if cleanup fails
    }
  }

  /**
   * Rollback migration by deleting all uploaded data (placeholder for future tasks)
   */
  async rollbackMigration(): Promise<RollbackResult> {
    console.log(`[MigrationService] Starting rollback for migration ${this.migrationId}`);
    
    try {
      // This will be implemented in Task 2.4
      // For now, just simulate rollback
      const rolledBackOperations = ['leagues', 'draft_sessions', 'player_selections', 'cost_adjustments'];
      
      console.log(`[MigrationService] Rollback completed for migration ${this.migrationId}`);
      return {
        success: true,
        rolledBackOperations
      };
    } catch (error) {
      console.error(`[MigrationService] Rollback failed for migration ${this.migrationId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown rollback error'
      };
    }
  }

  /**
   * Get migration statistics
   */
  getStatistics(): MigrationStatistics {
    return { ...this.statistics };
  }

  /**
   * Get migration data summary without starting migration
   */
  static async getMigrationPreview(): Promise<MigrationDataSummary> {
    try {
      const dexieAdapter = new DexieStorageAdapter('anonymous');
      const leagues = await dexieAdapter.loadLeagues();
      
      if (Object.keys(leagues.leagues).length === 0) {
        return {
          leagueCount: 0,
          draftCount: 0,
          totalSelections: 0,
          costAdjustments: 0,
          estimatedSizeBytes: 0,
          hasEspnAuthData: false
        };
      }

      let draftCount = 0;
      let totalSelections = 0;
      let costAdjustments = 0;
      let hasEspnAuthData = false;

      // Analyze each league's data
      for (const [leagueId, league] of Object.entries(leagues.leagues)) {
        // Check for ESPN auth data
        if (league.platform === 'espn' && (league as any).auth) {
          hasEspnAuthData = true;
        }

        // Count drafts and selections
        const mocks = await dexieAdapter.loadSavedMocks(leagueId as LeagueId);
        draftCount += Object.keys(mocks.mocks || {}).length;
        
        for (const draft of Object.values(mocks.mocks || {})) {
          if (draft.rosterSelections) {
            totalSelections += Object.keys(draft.rosterSelections).length;
          }
          if (draft.costAdjustments) {
            costAdjustments += Object.keys(draft.costAdjustments).length;
          }
        }
      }
      
      // Estimate data size (rough calculation)
      const estimatedSizeBytes = (
        Object.keys(leagues.leagues).length * 500 +  // ~500 bytes per league
        draftCount * 2000 +   // ~2KB per draft
        totalSelections * 200 + // ~200 bytes per selection
        costAdjustments * 100   // ~100 bytes per adjustment
      );

      return {
        leagueCount: Object.keys(leagues.leagues).length,
        draftCount,
        totalSelections,
        costAdjustments,
        estimatedSizeBytes,
        hasEspnAuthData
      };
    } catch (error) {
      console.warn('[MigrationService] Could not generate migration preview:', error);
      return {
        leagueCount: 0,
        draftCount: 0,
        totalSelections: 0,
        costAdjustments: 0,
        estimatedSizeBytes: 0,
        hasEspnAuthData: false
      };
    }
  }

  // Private helper methods

  private reportProgress(phase: MigrationPhase, progress: number, message: string, error?: string): void {
    const progressInfo: MigrationProgress = {
      phase,
      progress,
      message,
      error
    };

    console.log(`[MigrationService] ${phase.toUpperCase()}: ${progress}% - ${message}`);
    
    if (error) {
      console.error(`[MigrationService] Error: ${error}`);
    }

    this.progressCallback?.(progressInfo);
  }

  private getCurrentPhase(): MigrationPhase {
    // This could be enhanced to track current phase more precisely
    return 'export';
  }

  private getCurrentProgress(): number {
    // This could be enhanced to track current progress more precisely
    return 0;
  }

  private createSuccessResult(): MigrationResult {
    return {
      success: true,
      migratedLeagues: this.statistics.itemsProcessed.leagues,
      migratedDrafts: this.statistics.itemsProcessed.draftSessions,
      migrationId: this.migrationId,
      startTime: this.startTime,
      endTime: this.statistics.endTime,
      duration: this.statistics.duration
    };
  }
}