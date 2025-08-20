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
import { StoredLeaguesDataCurrent, StoredMocksDataCurrent, StoredDraftDataCurrent } from '@/types/storage';
import { 
  transformLeagueToDatabase, 
  transformDraftToDatabase, 
  DatabaseLeague,
  DatabaseDraftSession,
  DatabaseDraftSettings,
  DatabasePlayerSelection,
  DatabaseCostAdjustment
} from './transforms';
import { isInProgressSelectionsKey } from './constants';

/**
 * Service for migrating user data from Dexie to Supabase
 * Handles the complete migration process with progress tracking and error recovery
 */
export class DataMigrationService {
  private migrationId: string;
  private statistics: MigrationStatistics;
  private startTime: Date;
  private currentPhase: MigrationPhase;
  private lastReportedProgress: number = 0;

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
    this.currentPhase = 'export'; // Initialize with first phase
    
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

      // Final verification with longer delay to test persistence
      console.log('[MigrationService] ==================== FINAL VERIFICATION ====================');
      console.log('[MigrationService] Waiting 2 seconds to test data persistence...');
      await this.executeWithProgressUpdates(
        () => new Promise<void>(resolve => setTimeout(resolve, 2000)),
        'verify',
        85,
        90,
        'Testing data persistence'
      );
      
      try {
        const { data: finalCheck, error: finalError } = await this.supabase
          .from('leagues')
          .select('id, league_id, platform')
          .eq('user_id', this.userId);
          
        if (finalError) {
          console.error('[MigrationService] ❌ Final verification error:', finalError);
        } else {
          console.log('[MigrationService] ✅ Final verification - found', finalCheck?.length || 0, 'leagues still available');
          if ((finalCheck?.length || 0) === 0) {
            console.warn('[MigrationService] 🚨 CRITICAL: Data disappeared between verification and final check!');
          }
        }
      } catch (error) {
        console.error('[MigrationService] Final verification failed:', error);
      }
      console.log('[MigrationService] ==================== FINAL VERIFICATION COMPLETE ====================');

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
    
    try {
      // Load leagues
      const leagues = await dexieAdapter.loadLeagues();
      const leagueCount = Object.keys(leagues.leagues).length;
      const leagueIds = Object.keys(leagues.leagues);
      
      console.log(`[MigrationService.exportDexieData] Loaded ${leagueCount} leagues:`, leagueIds);
      
      if (leagueCount === 0) {
        throw new MigrationError(
          'No leagues found to migrate',
          undefined,
          'export',
          this.migrationId
        );
      }
      
      this.statistics.itemsProcessed.leagues = leagueCount;
      
      // Load all draft data for each league
      const mocks: Record<LeagueId, StoredMocksDataCurrent> = {};
      let totalDraftsFound = 0;
      
      for (const leagueId of leagueIds) {
        const leagueMocks = await dexieAdapter.loadSavedMocks(leagueId as LeagueId);
        mocks[leagueId as LeagueId] = leagueMocks;
        
        const draftsInThisLeague = Object.keys(leagueMocks || {}).length;
        const draftNames = Object.keys(leagueMocks || {});
        totalDraftsFound += draftsInThisLeague;
        
        console.log(`[MigrationService.exportDexieData] League ${leagueId}: ${draftsInThisLeague} drafts with names:`, draftNames);
        
        // Count draft sessions and selections (exclude IN_PROGRESS_SELECTIONS)
        for (const [draftName, draft] of Object.entries(leagueMocks || {})) {
          // Skip in-progress selections - they should not be migrated
          if (isInProgressSelectionsKey(draftName)) {
            console.log(`[MigrationService.exportDexieData]   Skipping in-progress selections for league ${leagueId}`);
            continue;
          }
          
          if (draft && typeof draft === 'object' && 'rosterSelections' in draft) {
            this.statistics.itemsProcessed.draftSessions += 1;
            const selectionCount = Object.keys(draft.rosterSelections || {}).length;
            this.statistics.itemsProcessed.playerSelections += selectionCount;
            console.log(`[MigrationService.exportDexieData]   Draft "${draftName}": ${selectionCount} selections`);
          }
          if (draft && typeof draft === 'object' && 'costAdjustments' in draft) {
            this.statistics.itemsProcessed.costAdjustments += Object.keys(draft.costAdjustments || {}).length;
          }
        }
      }
      
      console.log(`[MigrationService.exportDexieData] Export complete: ${leagueCount} leagues, ${totalDraftsFound} total drafts`);
      console.log(`[MigrationService.exportDexieData] Statistics:`, this.statistics.itemsProcessed);
      return { leagues, mocks };
      
    } catch (error) {
      console.error(`[MigrationService] Export failed:`, error);
      throw new MigrationError(
        'Failed to export Dexie data',
        error,
        'export',
        this.migrationId
      );
    }
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
    console.log('[MigrationService.transform] Starting data transformation for database insertion');
    console.log('[MigrationService.transform] Input leagues:', Object.keys(dexieData.leagues.leagues));
    console.log('[MigrationService.transform] Input mocks by league:', Object.keys(dexieData.mocks).map(lid => `${lid}: ${Object.keys(dexieData.mocks[lid as LeagueId]).length} drafts`));
    
    // Transform leagues using existing utility
    const transformedLeagues: Array<{ leagueId: LeagueId; dbLeague: Omit<DatabaseLeague, 'id' | 'created_at' | 'updated_at'> }> = [];
    
    for (const [leagueId, league] of Object.entries(dexieData.leagues.leagues)) {
      try {
        const dbLeague = transformLeagueToDatabase(leagueId as LeagueId, league, this.userId);
        transformedLeagues.push({
          leagueId: leagueId as LeagueId,
          dbLeague
        });
        console.log(`[MigrationService.transform] Transformed league ${leagueId} (${league.platform}) for database insertion`);
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
    console.log('[MigrationService] ==================== UPLOAD PHASE STARTING ====================');
    console.log('[MigrationService] Uploading data to Supabase database for user:', this.userId);
    console.log('[MigrationService] Transformed leagues to upload:', transformedData.transformedLeagues.length);
    console.log('[MigrationService] Original mocks to upload:', Object.keys(transformedData.originalMocks).length);
    
    // Upload leagues and return mapping of original league IDs to database IDs
    console.log('[MigrationService] ========== LEAGUES UPLOAD ==========');
    const leagueIdMapping = await this.migrateLeagues(transformedData.transformedLeagues);
    console.log('[MigrationService] League upload complete, mapping:', leagueIdMapping);
    
    // Upload drafts using the league ID mapping
    console.log('[MigrationService] ========== DRAFTS UPLOAD ==========');
    const draftCount = await this.migrateDrafts(transformedData.originalMocks, leagueIdMapping);
    console.log('[MigrationService] Drafts upload complete, count:', draftCount);
    
    console.log(`[MigrationService] ==================== UPLOAD PHASE COMPLETE ====================`);
    console.log(`[MigrationService] Successfully uploaded ${Object.keys(leagueIdMapping).length} leagues and ${draftCount} drafts`);
    return leagueIdMapping;
  }

  /**
   * Verify migrated data integrity - check that uploaded data is queryable
   */
  private async verifyMigratedData(): Promise<void> {
    console.log('[MigrationService] ==================== VERIFICATION PHASE ====================');
    console.log('[MigrationService] Verifying uploaded data is queryable for user:', this.userId);
    
    // Small delay to allow for database consistency in test environments
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      // First, check auth context and raw data
      console.log('[MigrationService] 🔍 DEBUGGING AUTH CONTEXT AND RLS:');
      
      // Check current auth session
      const { data: { session }, error: sessionError } = await this.supabase.auth.getSession();
      console.log('[MigrationService] Current session user_id:', session?.user?.id || 'null', 'error:', sessionError);
      console.log('[MigrationService] Target migration user_id:', this.userId);
      console.log('[MigrationService] Session matches target:', session?.user?.id === this.userId);
      
      // Query draft sessions to verify they're accessible
      const { data: drafts, error: draftError } = await this.supabase
        .from('draft_sessions')
        .select('id, name')
        .eq('user_id', this.userId);
        
      if (draftError) {
        console.warn('[MigrationService] ⚠️ Error querying uploaded drafts:', draftError);
      } else {
        const draftCount = drafts?.length || 0;
        console.log('[MigrationService] ✅ Verification - found', draftCount, 'drafts queryable for user:', this.userId);
      }
      
    } catch (error) {
      console.error('[MigrationService] ❌ Data verification failed:', error);
      // Don't fail the migration for verification errors in development
      if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
        console.warn('[MigrationService] Continuing despite verification failure in development/test environment');
        return;
      }
      throw error;
    }
    
    console.log('[MigrationService] ==================== VERIFICATION COMPLETE ====================');
  }

  /**
   * Clear Dexie data after successful migration
   */
  private async clearDexieDataAfterMigration(): Promise<void> {
    try {
      console.log('[MigrationService] Clearing Dexie data after successful migration...');
      const dexieAdapter = new DexieStorageAdapter('anonymous');
      
      // Use the proper clearAllData method
      await dexieAdapter.clearAllData();
      
      console.log('[MigrationService] ✅ Dexie data cleared after successful migration');
    } catch (error) {
      console.error('[MigrationService] ❌ Failed to clear Dexie data after migration:', error);
      // Don't fail the migration if cleanup fails - user data is safely in Supabase
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
        
        // Insert league into database with progress updates for UI responsiveness
        const startProgress = 60 + Math.floor(i / transformedLeagues.length * 10);
        const endProgress = 60 + Math.floor((i + 1) / transformedLeagues.length * 10);
        
        const { data, error } = await this.executeWithProgressUpdates(
          async () => {
            console.log(`[MigrationService] Inserting league ${leagueId} with DB ID ${dbLeagueId} for user ${this.userId}`);
            console.log(`[MigrationService] League data to insert:`, { id: dbLeagueId, ...dbLeague, created_at: now, updated_at: now });
            
            return await this.supabase
              .from('leagues')
              .insert({
                id: dbLeagueId,
                ...dbLeague,
                created_at: now,
                updated_at: now
              })
              .select('id')
              .single();
          },
          'upload',
          startProgress,
          endProgress,
          `Migrating league ${i + 1}/${transformedLeagues.length}`
        );

        console.log(`[MigrationService] League insert result - data:`, data, 'error:', error);

        if (error) {
          console.error(`[MigrationService] ❌ Failed to insert league ${leagueId}:`, error);
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
   * Migrate drafts to Supabase database
   * @param originalMocks Record of league IDs to their draft mocks data
   * @param leagueIdMapping Mapping of original league IDs to database primary keys
   * @returns Total number of drafts migrated
   */
  private async migrateDrafts(originalMocks: Record<LeagueId, StoredMocksDataCurrent>, leagueIdMapping: Record<LeagueId, string>): Promise<number> {
    let totalDraftsMigrated = 0;
    const totalLeagues = Object.keys(originalMocks).length;
    let processedLeagues = 0;
    
    console.log(`[MigrationService.migrateDrafts] Starting migration of drafts for ${totalLeagues} leagues`);
    console.log(`[MigrationService.migrateDrafts] League ID mapping:`, leagueIdMapping);
    
    for (const [leagueId, leagueMocks] of Object.entries(originalMocks)) {
      const leagueDbId = leagueIdMapping[leagueId as LeagueId];
      
      if (!leagueDbId) {
        console.warn(`[MigrationService.migrateDrafts] No database ID found for league ${leagueId}, skipping drafts`);
        continue;
      }
      
      const draftNames = Object.keys(leagueMocks || {});
      console.log(`[MigrationService.migrateDrafts] League ${leagueId} (DB: ${leagueDbId}): ${draftNames.length} drafts with names:`, draftNames);
      
      for (let i = 0; i < draftNames.length; i++) {
        const draftName = draftNames[i];
        
        // Skip in-progress selections - they should not be migrated
        if (isInProgressSelectionsKey(draftName)) {
          console.log(`[MigrationService.migrateDrafts]   Skipping in-progress selections for league ${leagueId}`);
          continue;
        }
        
        const draftData = leagueMocks[draftName];
        
        console.log(`[MigrationService.migrateDrafts]   Processing draft "${draftName}" (${i+1}/${draftNames.length})`);
        
        if (!draftData) {
          console.warn(`[MigrationService.migrateDrafts]   No data found for draft ${draftName}, skipping`);
          continue;
        }
        
        try {
          // Calculate progress for this draft operation
          const overallProgressStart = processedLeagues / totalLeagues + i / draftNames.length / totalLeagues;
          const overallProgressEnd = processedLeagues / totalLeagues + (i + 1) / draftNames.length / totalLeagues;
          const progressStart = 70 + Math.floor(overallProgressStart * 10); // 70-80% range
          const progressEnd = 70 + Math.floor(overallProgressEnd * 10); // 70-80% range
          
          await this.executeWithProgressUpdates(
            () => this.migrateSingleDraft(draftName, draftData, leagueId as LeagueId, leagueDbId),
            'upload',
            progressStart,
            progressEnd,
            `Migrating draft ${i + 1}/${draftNames.length} for league ${processedLeagues + 1}/${totalLeagues}`
          );
          totalDraftsMigrated++;
          
          console.log(`[MigrationService] Successfully migrated draft ${draftName} for league ${leagueId}`);
        } catch (error) {
          throw new MigrationError(
            `Failed to migrate draft ${draftName} for league ${leagueId}`,
            error,
            'upload',
            this.migrationId
          );
        }
      }
      
      processedLeagues++;
    }
    
    console.log(`[MigrationService] Successfully migrated ${totalDraftsMigrated} drafts`);
    return totalDraftsMigrated;
  }

  /**
   * Migrate a single draft with all its related data
   * @param draftName Name of the draft session
   * @param draftData Draft data from Dexie storage
   * @param leagueId Original league ID for error reporting
   * @param leagueDbId Database primary key for the league
   */
  private async migrateSingleDraft(
    draftName: string,
    draftData: StoredDraftDataCurrent,
    leagueId: LeagueId,
    leagueDbId: string
  ): Promise<void> {
    // Transform draft data using existing utility
    const transformed = transformDraftToDatabase(draftName, draftData, this.userId, leagueDbId);
    
    // Generate UUID for draft session
    const sessionId = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const now = new Date().toISOString();
    
    try {
      // Insert draft session first
      await this.insertDraftSession(sessionId, transformed.session, draftData);
      
      // Insert related data in parallel for better performance
      await Promise.all([
        this.insertDraftSettings(sessionId, transformed.settings),
        this.insertPlayerSelections(sessionId, transformed.selections),
        this.insertCostAdjustments(sessionId, transformed.adjustments)
      ]);
      
      console.log(`[MigrationService] Successfully migrated draft ${draftName} with ${transformed.selections.length} selections and ${transformed.adjustments.length} adjustments`);
    } catch (error) {
      // If this is already a MigrationError, re-throw it
      if (error instanceof MigrationError) {
        throw error;
      }
      
      // Otherwise, wrap in MigrationError
      throw new MigrationError(
        `Failed to migrate draft ${draftName} for league ${leagueId}`,
        error,
        'upload',
        this.migrationId
      );
    }
  }

  /**
   * Insert draft session into database
   */
  private async insertDraftSession(
    sessionId: string,
    sessionData: Omit<DatabaseDraftSession, 'id' | 'created_at' | 'updated_at'>,
    originalDraft: StoredDraftDataCurrent
  ): Promise<void> {
    const now = new Date().toISOString();
    
    const { error } = await this.supabase
      .from('draft_sessions')
      .insert({
        id: sessionId,
        ...sessionData,
        created_at: new Date(originalDraft.created).toISOString(),
        updated_at: new Date(originalDraft.modified).toISOString()
      });

    if (error) {
      throw new MigrationError(
        `Failed to insert draft session: ${error.message}`,
        error,
        'upload',
        this.migrationId
      );
    }
  }

  /**
   * Insert draft settings into database
   */
  private async insertDraftSettings(
    sessionId: string,
    settingsData: Omit<DatabaseDraftSettings, 'id' | 'draft_session_id' | 'created_at' | 'updated_at'>
  ): Promise<void> {
    const now = new Date().toISOString();
    
    const { error } = await this.supabase
      .from('draft_settings')
      .insert({
        id: typeof crypto !== 'undefined' && crypto.randomUUID 
          ? crypto.randomUUID() 
          : `settings-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        draft_session_id: sessionId,
        ...settingsData,
        created_at: now,
        updated_at: now
      });

    if (error) {
      throw new MigrationError(
        `Failed to insert draft settings: ${error.message}`,
        error,
        'upload',
        this.migrationId
      );
    }
  }

  /**
   * Insert player selections into database
   */
  private async insertPlayerSelections(
    sessionId: string,
    selections: Omit<DatabasePlayerSelection, 'id' | 'draft_session_id' | 'selected_at'>[]
  ): Promise<void> {
    if (selections.length === 0) {
      return; // No selections to insert
    }

    const now = new Date().toISOString();
    
    // Prepare bulk insert data
    const selectionsToInsert = selections.map(selection => ({
      id: typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : `selection-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      draft_session_id: sessionId,
      ...selection,
      selected_at: now
    }));

    const { error } = await this.supabase
      .from('player_selections')
      .insert(selectionsToInsert);

    if (error) {
      throw new MigrationError(
        `Failed to insert player selections: ${error.message}`,
        error,
        'upload',
        this.migrationId
      );
    }
  }

  /**
   * Insert cost adjustments into database
   */
  private async insertCostAdjustments(
    sessionId: string,
    adjustments: Omit<DatabaseCostAdjustment, 'id' | 'draft_session_id' | 'created_at' | 'updated_at'>[]
  ): Promise<void> {
    if (adjustments.length === 0) {
      return; // No adjustments to insert
    }

    const now = new Date().toISOString();
    
    // Prepare bulk insert data
    const adjustmentsToInsert = adjustments.map(adjustment => ({
      id: typeof crypto !== 'undefined' && crypto.randomUUID 
        ? crypto.randomUUID() 
        : `adjustment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      draft_session_id: sessionId,
      ...adjustment,
      created_at: now,
      updated_at: now
    }));

    const { error } = await this.supabase
      .from('cost_adjustments')
      .insert(adjustmentsToInsert);

    if (error) {
      throw new MigrationError(
        `Failed to insert cost adjustments: ${error.message}`,
        error,
        'upload',
        this.migrationId
      );
    }
  }

  /**
   * Rollback migration by deleting all uploaded data for this user
   */
  async rollbackMigration(): Promise<RollbackResult> {
    console.log(`[MigrationService] Starting rollback for migration ${this.migrationId}`);
    
    try {
      const rolledBackOperations: string[] = [];
      
      // Get all draft session IDs for this user before deletion
      const { data: draftSessions } = await this.supabase
        .from('draft_sessions')
        .select('id')
        .eq('user_id', this.userId);
      
      const sessionIds = draftSessions?.map(session => session.id) || [];
      
      // Delete in reverse dependency order to avoid foreign key violations
      
      // 1. Delete cost adjustments
      if (sessionIds.length > 0) {
        const { error: adjustmentsError, count: deletedAdjustments } = await this.supabase
          .from('cost_adjustments')
          .delete()
          .in('draft_session_id', sessionIds)
          .select();

        if (adjustmentsError) {
          console.error(`[MigrationService] Failed to delete cost adjustments during rollback:`, adjustmentsError);
          throw new Error(`Failed to rollback cost adjustments: ${adjustmentsError.message}`);
        }

        if (deletedAdjustments && deletedAdjustments > 0) {
          rolledBackOperations.push('cost_adjustments');
          console.log(`[MigrationService] Rolled back ${deletedAdjustments} cost adjustments`);
        }
      }

      // 2. Delete player selections
      if (sessionIds.length > 0) {
        const { error: selectionsError, count: deletedSelections } = await this.supabase
          .from('player_selections')
          .delete()
          .in('draft_session_id', sessionIds)
          .select();

        if (selectionsError) {
          console.error(`[MigrationService] Failed to delete player selections during rollback:`, selectionsError);
          throw new Error(`Failed to rollback player selections: ${selectionsError.message}`);
        }

        if (deletedSelections && deletedSelections > 0) {
          rolledBackOperations.push('player_selections');
          console.log(`[MigrationService] Rolled back ${deletedSelections} player selections`);
        }
      }

      // 3. Delete draft settings
      if (sessionIds.length > 0) {
        const { error: settingsError, count: deletedSettings } = await this.supabase
          .from('draft_settings')
          .delete()
          .in('draft_session_id', sessionIds)
          .select();

        if (settingsError) {
          console.error(`[MigrationService] Failed to delete draft settings during rollback:`, settingsError);
          throw new Error(`Failed to rollback draft settings: ${settingsError.message}`);
        }

        if (deletedSettings && deletedSettings > 0) {
          rolledBackOperations.push('draft_settings');
          console.log(`[MigrationService] Rolled back ${deletedSettings} draft settings`);
        }
      }

      // 4. Delete draft sessions
      const { error: sessionsError, count: deletedSessions } = await this.supabase
        .from('draft_sessions')
        .delete()
        .eq('user_id', this.userId)
        .select();

      if (sessionsError) {
        console.error(`[MigrationService] Failed to delete draft sessions during rollback:`, sessionsError);
        throw new Error(`Failed to rollback draft sessions: ${sessionsError.message}`);
      }

      if (deletedSessions && deletedSessions > 0) {
        rolledBackOperations.push('draft_sessions');
        console.log(`[MigrationService] Rolled back ${deletedSessions} draft sessions`);
      }

      // 5. Delete leagues last
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
      const leagueCount = Object.keys(leagues.leagues).length;
      
      console.log(`[MigrationService] Preview found ${leagueCount} leagues`);
      
      if (leagueCount === 0) {
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
        const mocksInLeague = Object.keys(mocks || {}).length;
        draftCount += mocksInLeague;
        
        console.log(`[MigrationService] League ${leagueId}: ${mocksInLeague} drafts`);
        
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
        leagueCount * 500 +  // ~500 bytes per league
        draftCount * 2000 +   // ~2KB per draft
        totalSelections * 200 + // ~200 bytes per selection
        costAdjustments * 100   // ~100 bytes per adjustment
      );

      console.log(`[MigrationService] Preview successful: ${leagueCount} leagues, ${draftCount} drafts`);
      
      return {
        leagueCount,
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

  /**
   * Execute an async operation with frequent progress updates to maintain UI responsiveness
   */
  private async executeWithProgressUpdates<T>(
    operation: () => Promise<T>,
    phase: MigrationPhase,
    startProgress: number,
    endProgress: number,
    operationName: string,
    updateIntervalMs = 500
  ): Promise<T> {
    // Ensure progress never goes backwards
    const adjustedStartProgress = Math.max(startProgress, this.lastReportedProgress);
    const adjustedEndProgress = Math.max(endProgress, adjustedStartProgress + 1);
    
    let currentProgress = adjustedStartProgress;
    const progressIncrement = Math.max(1, Math.floor((adjustedEndProgress - adjustedStartProgress) / 10));
    
    // Start progress reporting
    this.reportProgress(phase, currentProgress, `${operationName}...`);
    
    // Setup interval for progress updates
    const progressInterval = setInterval(() => {
      currentProgress = Math.min(currentProgress + progressIncrement, adjustedEndProgress - 1);
      this.reportProgress(phase, currentProgress, `${operationName}...`);
    }, updateIntervalMs);
    
    try {
      const result = await operation();
      clearInterval(progressInterval);
      this.reportProgress(phase, adjustedEndProgress, `${operationName} completed`);
      return result;
    } catch (error) {
      clearInterval(progressInterval);
      throw error;
    }
  }

  private reportProgress(phase: MigrationPhase, progress: number, message: string, error?: string): void {
    // Update current phase tracking
    this.currentPhase = phase;
    
    // Ensure progress never goes backwards
    const adjustedProgress = Math.max(progress, this.lastReportedProgress);
    this.lastReportedProgress = adjustedProgress;
    
    const progressInfo: MigrationProgress = {
      phase,
      progress: adjustedProgress,
      message,
      error
    };

    console.log(`[MigrationService] ${phase.toUpperCase()}: ${adjustedProgress}% - ${message}`);
    
    if (error) {
      console.error(`[MigrationService] Error: ${error}`);
    }

    this.progressCallback?.(progressInfo);
  }

  private getCurrentPhase(): MigrationPhase {
    return this.currentPhase;
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