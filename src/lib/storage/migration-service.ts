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

/**
 * Service for migrating user data from Dexie to Supabase
 * Handles the complete migration process with progress tracking and error recovery
 */
export class DataMigrationService {
  private migrationId: string;
  private statistics: MigrationStatistics;
  private startTime: Date;
  private currentPhase: MigrationPhase;

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
      // Only count non-null drafts to match what will actually be migrated
      for (const draft of Object.values(leagueMocks || {})) {
        if (draft && typeof draft === 'object' && 'rosterSelections' in draft) {
          this.statistics.itemsProcessed.draftSessions += 1; // Count valid draft
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
    
    // Upload drafts using the league ID mapping
    const draftCount = await this.migrateDrafts(transformedData.originalMocks, leagueIdMapping);
    
    console.log(`[MigrationService] Successfully uploaded ${Object.keys(leagueIdMapping).length} leagues and ${draftCount} drafts`);
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
        for (const rosterName of Object.keys(mocks || {})) {
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
   * Migrate drafts to Supabase database
   * @param originalMocks Record of league IDs to their draft mocks data
   * @param leagueIdMapping Mapping of original league IDs to database primary keys
   * @returns Total number of drafts migrated
   */
  private async migrateDrafts(originalMocks: Record<LeagueId, StoredMocksDataCurrent>, leagueIdMapping: Record<LeagueId, string>): Promise<number> {
    let totalDraftsMigrated = 0;
    const totalLeagues = Object.keys(originalMocks).length;
    let processedLeagues = 0;
    
    console.log(`[MigrationService] Starting migration of drafts for ${totalLeagues} leagues`);
    
    for (const [leagueId, leagueMocks] of Object.entries(originalMocks)) {
      const leagueDbId = leagueIdMapping[leagueId as LeagueId];
      
      if (!leagueDbId) {
        console.warn(`[MigrationService] No database ID found for league ${leagueId}, skipping drafts`);
        continue;
      }
      
      const draftNames = Object.keys(leagueMocks || {});
      console.log(`[MigrationService] Migrating ${draftNames.length} drafts for league ${leagueId}`);
      
      for (let i = 0; i < draftNames.length; i++) {
        const draftName = draftNames[i];
        const draftData = leagueMocks[draftName];
        
        if (!draftData) {
          console.warn(`[MigrationService] No data found for draft ${draftName}, skipping`);
          continue;
        }
        
        try {
          await this.migrateSingleDraft(draftName, draftData, leagueId as LeagueId, leagueDbId);
          totalDraftsMigrated++;
          
          // Update progress - drafts represent the second part of upload phase (70-80% range)
          const overallProgress = processedLeagues / totalLeagues + (i + 1) / draftNames.length / totalLeagues;
          const progress = 70 + Math.floor(overallProgress * 10); // 70-80% range
          this.reportProgress('upload', progress, `Migrated draft ${i + 1}/${draftNames.length} for league ${processedLeagues + 1}/${totalLeagues}`);
          
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
    // Update current phase tracking
    this.currentPhase = phase;
    
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