/**
 * SupabaseStorageAdapter implements the StorageAdapter interface using Supabase
 * This provides persistent, multi-device storage with proper authentication and RLS
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { LeagueId, PlatformLeague } from '@/platforms/common';
import type { EspnAuth as PlatformEspnAuth } from '@/platforms/espn/league';
import {
  StorageAdapter,
  createStorageError,
  type StorageConfig
} from './interface';
import {
  StoredLeaguesDataCurrent,
  StoredMocksDataCurrent,
  StoredDraftDataCurrent,
  RosterSelections,
  EstimationSettingsState,
  SearchSettingsState,
  CURRENT_LEAGUES_SCHEMA_VERSION
} from '@/types/storage';
import {
  transformLeaguesFromDatabase,
  transformLeagueToDatabase,
  transformMocksFromDatabase,
  transformDraftToDatabase,
  createLeagueQuery,
  type DatabaseLeague,
  type DatabaseDraftSession,
  type DatabaseDraftSettings,
  type DatabasePlayerSelection,
  type DatabaseCostAdjustment
} from './transforms';
import { encryptEspnAuth, decryptEspnAuth, type EspnAuth } from '../encryption/utils';
import type { Database } from '@/lib/database.types';

/**
 * Retry configuration for network operations
 */
interface RetryConfig {
  maxRetries: number;
  backoffMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoffMs: 1000
};

/**
 * SupabaseStorageAdapter implementation
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  private readonly retryConfig: RetryConfig;

  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly userId: string,
    config?: Partial<StorageConfig>
  ) {
    this.retryConfig = config?.retryConfig || DEFAULT_RETRY_CONFIG;
  }

  /**
   * Check if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Don't retry on authentication/authorization errors
    if (error?.code === '42501' || error?.message?.includes('RLS')) {
      return false;
    }
    
    // Don't retry on JWT errors  
    if (error?.code === 'PGRST301') {
      return false;
    }
    
    // Retry on network/connection errors and other transient failures
    return true;
  }

  /**
   * Retry wrapper for database operations
   */
  private async withRetry<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: { leagueId?: LeagueId; rosterName?: string },
    attempt = 0
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      // Check if error is retryable before attempting retry
      if (attempt < this.retryConfig.maxRetries && this.isRetryableError(error)) {
        const delay = this.retryConfig.backoffMs * Math.pow(2, attempt);
        console.warn(`[SupabaseStorage] Retrying ${operation} after ${delay}ms (attempt ${attempt + 1}/${this.retryConfig.maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.withRetry(operation, fn, context, attempt + 1);
      }
      
      // All retries exhausted or non-retryable error - convert to StorageError
      this.handleError(operation, error, context);
    }
  }

  /**
   * Handle Supabase errors and convert to StorageError
   */
  private handleError(
    operation: string,
    error: any,
    context?: { leagueId?: LeagueId; rosterName?: string }
  ): never {
    console.error(`[SupabaseStorage] Error in ${operation}:`, error);
    if (context) {
      console.error(`[SupabaseStorage] Context:`, context);
    }

    // Determine error type based on Supabase error
    if (error?.code === '42501' || error?.message?.includes('RLS')) {
      throw createStorageError('AUTH_ERROR', 'Access denied - user not authorized', error, { operation, ...context });
    }
    
    if (error?.code === 'PGRST301' || error?.message?.includes('network')) {
      throw createStorageError('NETWORK_ERROR', 'Network connection failed', error, { operation, ...context });
    }
    
    throw createStorageError('DATA_ERROR', `Database operation failed: ${operation}`, error, { operation, ...context });
  }

  /**
   * Load all saved leagues for the current user
   */
  async loadLeagues(): Promise<StoredLeaguesDataCurrent> {
    return this.withRetry('loadLeagues', async () => {
      const { data, error } = await this.supabase
        .from('leagues')
        .select('*')
        .eq('user_id', this.userId);

      if (error) throw error;

      return transformLeaguesFromDatabase(data || []);
    });
  }

  /**
   * Save a league configuration
   */
  async saveLeague(leagueId: LeagueId, league: PlatformLeague): Promise<void> {
    return this.withRetry('saveLeague', async () => {
      const leagueData = transformLeagueToDatabase(leagueId, league, this.userId);
      
      // Handle ESPN auth encryption if present
      let authDataEncrypted: string | null = null;
      if (league.platform === 'espn' && 'auth' in league && league.auth) {
        // ESPN auth has espnS2 and swid properties, convert to cookies format
        const espnAuthData = league.auth as PlatformEspnAuth;
        const espnAuth: import('../encryption/utils').EspnAuth = { 
          cookies: `espn_s2=${espnAuthData.espnS2 || ''}; SWID=${espnAuthData.swid || ''}` 
        };
        const encrypted = await encryptEspnAuth(espnAuth);
        authDataEncrypted = encrypted.toString('base64');
      }

      const { error } = await this.supabase
        .from('leagues')
        .upsert({
          ...leagueData,
          auth_data_encrypted: authDataEncrypted
        }, {
          onConflict: 'user_id,league_id,platform'
        });

      if (error) throw error;
    });
  }

  /**
   * Load a single league by ID
   */
  async loadLeague(leagueId: LeagueId): Promise<PlatformLeague | undefined> {
    return this.withRetry('loadLeague', async () => {
      try {
        const { data, error } = await this.supabase
          .from('leagues')
          .select('*')
          .eq('user_id', this.userId)
          .eq('league_id', leagueId.toString())
          .single();

        if (error) {
          if (error.code === 'PGRST116') { // No rows returned
            return undefined;
          }
          throw error;
        }

        // Transform basic league data
        const league: PlatformLeague = {
          platform: data.platform as any,
          id: data.league_id as LeagueId
        };

        // Decrypt ESPN auth if present
        if (data.auth_data_encrypted && data.platform === 'espn') {
          try {
            const encryptedBuffer = Buffer.from(data.auth_data_encrypted, 'base64');
            const decryptedAuth = await decryptEspnAuth(encryptedBuffer);
            
            // Parse cookies back to ESPN auth format
            const cookies = decryptedAuth.cookies;
            const espnS2Match = cookies.match(/espn_s2=([^;]*)/);
            const swidMatch = cookies.match(/SWID=([^;]*)/);
            
            (league as any).auth = {
              espnS2: espnS2Match ? espnS2Match[1] : '',
              swid: swidMatch ? swidMatch[1] : ''
            };
          } catch (decryptError) {
            console.warn('[SupabaseStorage] Failed to decrypt auth data:', decryptError);
            // Continue without auth data rather than failing completely
          }
        }

        return league;
      } catch (error) {
        this.handleError('loadLeague', error, { leagueId });
      }
    });
  }

  /**
   * Load all saved mock drafts for a specific league
   */
  async loadSavedMocks(leagueId: LeagueId): Promise<StoredMocksDataCurrent> {
    return this.withRetry('loadSavedMocks', async () => {
      try {
        // First get the league database ID
        const { data: leagues, error: leagueError } = await this.supabase
          .from('leagues')
          .select('id')
          .eq('user_id', this.userId)
          .eq('league_id', leagueId.toString())
          .single();

        if (leagueError) {
          if (leagueError.code === 'PGRST116') { // No league found
            return {};
          }
          throw leagueError;
        }

        const leagueDbId = leagues.id;

        // Get all draft sessions for this league
        const { data: sessions, error: sessionsError } = await this.supabase
          .from('draft_sessions')
          .select('*')
          .eq('league_id', leagueDbId);

        if (sessionsError) throw sessionsError;

        if (!sessions || sessions.length === 0) {
          return {};
        }

        const sessionIds = sessions.map(s => s.id);

        // Get all related data in parallel
        const [
          { data: settings, error: settingsError },
          { data: selections, error: selectionsError },
          { data: adjustments, error: adjustmentsError }
        ] = await Promise.all([
          this.supabase
            .from('draft_settings')
            .select('*')
            .in('draft_session_id', sessionIds),
          this.supabase
            .from('player_selections')
            .select('*')
            .in('draft_session_id', sessionIds),
          this.supabase
            .from('cost_adjustments')
            .select('*')
            .in('draft_session_id', sessionIds)
        ]);

        if (settingsError) throw settingsError;
        if (selectionsError) throw selectionsError;
        if (adjustmentsError) throw adjustmentsError;

        return transformMocksFromDatabase(
          sessions,
          settings || [],
          selections || [],
          adjustments || []
        );
      } catch (error) {
        this.handleError('loadSavedMocks', error, { leagueId });
      }
    });
  }

  /**
   * Save mock draft data for a league
   */
  async saveMock(leagueId: LeagueId, data: StoredMocksDataCurrent): Promise<void> {
    return this.withRetry('saveMock', async () => {
      try {
        // Get the league database ID
        const { data: leagues, error: leagueError } = await this.supabase
          .from('leagues')
          .select('id')
          .eq('user_id', this.userId)
          .eq('league_id', leagueId.toString())
          .single();

        if (leagueError) throw leagueError;
        const leagueDbId = leagues.id;

        // Save each draft in the data
        for (const [rosterName, draft] of Object.entries(data)) {
          await this.saveSelectedRoster(
            leagueId,
            rosterName,
            draft.rosterSelections,
            draft.costAdjustments,
            draft.estimationSettings,
            draft.searchSettings,
            draft.notes
          );
        }
      } catch (error) {
        this.handleError('saveMock', error, { leagueId });
      }
    });
  }

  /**
   * Load a specific draft by name within a league
   */
  async loadDraftByName(leagueId: LeagueId, rosterName: string): Promise<StoredDraftDataCurrent | undefined> {
    return this.withRetry('loadDraftByName', async () => {
      try {
        const mocks = await this.loadSavedMocks(leagueId);
        return mocks[rosterName];
      } catch (error) {
        this.handleError('loadDraftByName', error, { leagueId, rosterName });
      }
    });
  }

  /**
   * Save a complete roster/draft configuration
   */
  async saveSelectedRoster(
    leagueId: LeagueId,
    rosterName: string,
    rosterSelections: RosterSelections,
    costAdjustments: Record<string, number>,
    estimationSettings: EstimationSettingsState,
    searchSettings: SearchSettingsState,
    notes: string = ''
  ): Promise<void> {
    return this.withRetry('saveSelectedRoster', async () => {
      try {
        // Get the league database ID
        const { data: leagues, error: leagueError } = await this.supabase
          .from('leagues')
          .select('id')
          .eq('user_id', this.userId)
          .eq('league_id', leagueId.toString())
          .single();

        if (leagueError) throw leagueError;
        const leagueDbId = leagues.id;

        // Create draft data
        const currentTime = Date.now();
        const draftData: StoredDraftDataCurrent = {
          year: new Date().getFullYear().toString() as any, // Current season
          notes,
          created: currentTime,
          modified: currentTime,
          rosterSelections,
          costAdjustments,
          estimationSettings,
          searchSettings
        };

        const transformed = transformDraftToDatabase(rosterName, draftData, this.userId, leagueDbId);

        // Use a transaction to ensure consistency
        const { data: session, error: sessionError } = await this.supabase
          .from('draft_sessions')
          .upsert({
            ...transformed.session,
            user_id: this.userId,
            league_id: leagueDbId
          }, {
            onConflict: 'user_id,league_id,name'
          })
          .select('id')
          .single();

        if (sessionError) throw sessionError;
        const sessionId = session.id;

        // Delete existing related data
        await Promise.all([
          this.supabase
            .from('draft_settings')
            .delete()
            .eq('draft_session_id', sessionId),
          this.supabase
            .from('player_selections')
            .delete()
            .eq('draft_session_id', sessionId),
          this.supabase
            .from('cost_adjustments')
            .delete()
            .eq('draft_session_id', sessionId)
        ]);

        // Insert new data
        const insertPromises = [];

        // Insert settings
        insertPromises.push(
          this.supabase
            .from('draft_settings')
            .insert({
              ...transformed.settings,
              draft_session_id: sessionId
            })
        );

        // Insert selections
        if (transformed.selections.length > 0) {
          insertPromises.push(
            this.supabase
              .from('player_selections')
              .insert(
                transformed.selections.map(s => ({
                  ...s,
                  draft_session_id: sessionId
                }))
              )
          );
        }

        // Insert adjustments
        if (transformed.adjustments.length > 0) {
          insertPromises.push(
            this.supabase
              .from('cost_adjustments')
              .insert(
                transformed.adjustments.map(a => ({
                  ...a,
                  draft_session_id: sessionId
                }))
              )
          );
        }

        const results = await Promise.all(insertPromises);
        for (const result of results) {
          if (result.error) throw result.error;
        }
      } catch (error) {
        this.handleError('saveSelectedRoster', error, { leagueId, rosterName });
      }
    });
  }

  /**
   * Delete a specific roster/draft
   */
  async deleteRoster(leagueId: LeagueId, rosterName: string): Promise<void> {
    return this.withRetry('deleteRoster', async () => {
      try {
        // Get the league database ID
        const { data: leagues, error: leagueError } = await this.supabase
          .from('leagues')
          .select('id')
          .eq('user_id', this.userId)
          .eq('league_id', leagueId.toString())
          .single();

        if (leagueError) throw leagueError;
        const leagueDbId = leagues.id;

        // Delete the draft session (cascading deletes will handle related data)
        const { error } = await this.supabase
          .from('draft_sessions')
          .delete()
          .eq('user_id', this.userId)
          .eq('league_id', leagueDbId)
          .eq('name', rosterName);

        if (error) throw error;
      } catch (error) {
        this.handleError('deleteRoster', error, { leagueId, rosterName });
      }
    });
  }
}