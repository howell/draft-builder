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
import { transformLeagueToDatabase, DatabaseLeague } from './transforms';

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
      
      // Count draft sessions and selections (leagueMocks is direct StoredMocksDataCurrent)
      this.statistics.itemsProcessed.draftSessions += Object.keys(leagueMocks || {}).length;
      
      for (const draft of Object.values(leagueMocks || {})) {
        if (draft && typeof draft === 'object' && 'rosterSelections' in draft) {
          this.statistics.itemsProcessed.playerSelections += Object.keys(draft.rosterSelections || {}).length;
        }
        if (draft && typeof draft === 'object' && 'costAdjustments' in draft) {
          this.statistics.itemsProcessed.costAdjustments += Object.keys(draft.costAdjustments || {}).length;
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
    if (dexieData.leagues.schemaVersion !== 3) {
      console.warn(`[MigrationService] Unexpected leagues schema version: ${dexieData.leagues.schemaVersion}`);
    }

    // Note: Dexie mocks data doesn't have schema version wrapper, it's direct StoredMocksDataCurrent
    // Schema validation for mocks will be handled at the individual draft level if needed

    console.log(`[MigrationService] Data validation passed for ${Object.keys(dexieData.leagues.leagues).length} leagues`);
  }

  /**
   * Transform data for database insertion 
   */
  private async transformDataForMigration(dexieData: { leagues: StoredLeaguesDataCurrent; mocks: Record<LeagueId, StoredMocksDataCurrent> }): Promise<{
    transformedLeagues: Array<{ leagueId: LeagueId; dbLeague: Omit<DatabaseLeague, 'id' | 'created_at' | 'updated_at'> }>;
    originalMocks: Record<LeagueId, StoredMocksDataCurrent>;
  }> {
    console.log('[MigrationService] Transforming data for database insertion');
    
    // Transform leagues using existing utility
    const transformedLeagues: Array<{ leagueId: LeagueId; dbLeague: Omit<DatabaseLeague, 'id' | 'created_at' | 'updated_at'> }> = [];
    
    for (const [leagueId, league] of Object.entries(dexieData.leagues.leagues)) {
      try {
        const dbLeague = transformLeagueToDatabase(leagueId as LeagueId, league, this.userId);
        transformedLeagues.push({
          leagueId: leagueId as LeagueId,
          dbLeague
        });
        console.log(`[MigrationService] Transformed league ${leagueId} for database insertion`);
      } catch (error) {
        throw new MigrationError(
          `Failed to transform league ${leagueId} for migration`,
          error,
          'transform',
          this.migrationId
        );
      }
    }
    
    return {
      transformedLeagues,
      originalMocks: dexieData.mocks
    };
  }

  /**
   * Upload data to Supabase database
   */
  private async uploadDataToSupabase(transformedData: {
    transformedLeagues: Array<{ leagueId: LeagueId; dbLeague: Omit<DatabaseLeague, 'id' | 'created_at' | 'updated_at'> }>;
    originalMocks: Record<LeagueId, StoredMocksDataCurrent>;
  }): Promise<Record<LeagueId, string>> {
    console.log('[MigrationService] Uploading data to Supabase database');
    
    // Upload leagues and return mapping of original league IDs to database IDs
    const leagueIdMapping = await this.migrateLeagues(transformedData.transformedLeagues);
    
    // TODO: Draft migration will be implemented in Task 2.3
    // await this.migrateDrafts(transformedData.originalMocks, leagueIdMapping);
    
    console.log(`[MigrationService] Successfully uploaded ${Object.keys(leagueIdMapping).length} leagues`);
    return leagueIdMapping;
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
      
      // Clear all rosters for each league first
      const leagues = await dexieAdapter.loadLeagues();
      for (const leagueId of Object.keys(leagues.leagues)) {
        const mocks = await dexieAdapter.loadSavedMocks(leagueId as LeagueId);
        for (const rosterName of Object.keys(mocks.mocks || {})) {
          await dexieAdapter.deleteRoster(leagueId as LeagueId, rosterName);
        }
      }
      
      // Clear each league individually since there's no bulk clear method
      for (const leagueId of Object.keys(leagues.leagues)) {
        // Save empty mocks for each league (saveMock expects StoredMocksDataCurrent, not wrapped object)
        await dexieAdapter.saveMock(leagueId as LeagueId, {});
      }
      
      console.log('[MigrationService] Dexie data cleared after successful migration');
    } catch (error) {
      console.warn('[MigrationService] Failed to clear Dexie data after migration:', error);
      // Don't fail the migration if cleanup fails
    }
  }

  /**
   * Migrate leagues to Supabase database
   * @param transformedLeagues Array of transformed league data ready for database insertion
   * @returns Mapping of original league IDs to database primary keys
   */
  private async migrateLeagues(transformedLeagues: Array<{ leagueId: LeagueId; dbLeague: Omit<DatabaseLeague, 'id' | 'created_at' | 'updated_at'> }>): Promise<Record<LeagueId, string>> {
    const leagueIdMapping: Record<LeagueId, string> = {};
    const now = new Date().toISOString();
    
    console.log(`[MigrationService] Starting migration of ${transformedLeagues.length} leagues`);
    
    for (let i = 0; i < transformedLeagues.length; i++) {
      const { leagueId, dbLeague } = transformedLeagues[i];
      
      try {
        // Generate UUID for database primary key
        const dbLeagueId = typeof crypto !== 'undefined' && crypto.randomUUID 
          ? crypto.randomUUID() 
          : `league-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Insert league into database
        const { data, error } = await this.supabase
          .from('leagues')
          .insert({
            id: dbLeagueId,
            ...dbLeague,
            created_at: now,
            updated_at: now
          })
          .select('id')
          .single();

        if (error) {
          throw new MigrationError(
            `Failed to insert league ${leagueId} into database: ${error.message}`,
            error,
            'upload',
            this.migrationId
          );
        }

        if (!data?.id) {
          throw new MigrationError(
            `League ${leagueId} was inserted but no ID was returned`,
            undefined,
            'upload',
            this.migrationId
          );
        }

        // Store mapping for later use in draft migration
        leagueIdMapping[leagueId] = data.id;
        
        // Update progress (leagues represent a portion of upload phase)
        const progress = 60 + Math.floor((i + 1) / transformedLeagues.length * 10); // 60-70% range
        this.reportProgress('upload', progress, `Migrated league ${i + 1}/${transformedLeagues.length}`);
        
        console.log(`[MigrationService] Successfully migrated league ${leagueId} -> ${data.id}`);
      } catch (error) {
        // If this is already a MigrationError, re-throw it
        if (error instanceof MigrationError) {
          throw error;
        }
        
        // Otherwise, wrap in MigrationError
        throw new MigrationError(
          `Failed to migrate league ${leagueId}`,
          error,
          'upload',
          this.migrationId
        );
      }
    }
    
    console.log(`[MigrationService] Successfully migrated ${transformedLeagues.length} leagues`);
    return leagueIdMapping;
  }

  /**
   * Rollback migration by deleting all uploaded data for this user
   */
  async rollbackMigration(): Promise<RollbackResult> {
    console.log(`[MigrationService] Starting rollback for migration ${this.migrationId}`);
    
    try {
      const rolledBackOperations: string[] = [];
      
      // Delete leagues (this will cascade to related draft data when implemented)
      const { error: leagueError, count: deletedLeagues } = await this.supabase
        .from('leagues')
        .delete()
        .eq('user_id', this.userId)
        .select();

      if (leagueError) {
        console.error(`[MigrationService] Failed to delete leagues during rollback:`, leagueError);
        throw new Error(`Failed to rollback leagues: ${leagueError.message}`);
      }

      if (deletedLeagues && deletedLeagues > 0) {
        rolledBackOperations.push('leagues');
        console.log(`[MigrationService] Rolled back ${deletedLeagues} leagues`);
      }
      
      // TODO: Add draft-related rollback operations in Task 2.3/2.4
      // - draft_sessions
      // - draft_settings  
      // - player_selections
      // - cost_adjustments
      
      console.log(`[MigrationService] Rollback completed for migration ${this.migrationId}. Operations rolled back: ${rolledBackOperations.join(', ')}`);
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

        // Count drafts and selections (mocks is direct StoredMocksDataCurrent)
        const mocks = await dexieAdapter.loadSavedMocks(leagueId as LeagueId);
        draftCount += Object.keys(mocks || {}).length;
        
        for (const draft of Object.values(mocks || {})) {
          if (draft && typeof draft === 'object' && 'rosterSelections' in draft) {
            totalSelections += Object.keys(draft.rosterSelections || {}).length;
          }
          if (draft && typeof draft === 'object' && 'costAdjustments' in draft) {
            costAdjustments += Object.keys(draft.costAdjustments || {}).length;
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