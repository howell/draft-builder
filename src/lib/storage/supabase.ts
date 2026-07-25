/**
 * SupabaseStorageAdapter implements the StorageAdapter interface using Supabase
 * This provides persistent, multi-device storage with proper authentication and RLS
 */

import { SupabaseClient, PostgrestResponse } from '@supabase/supabase-js';
import { EspnLeague, LeagueId, PlatformLeague } from '@/platforms/common';
import type { EspnAuth as PlatformEspnAuth } from '@/platforms/espn/league';
import {
  StorageAdapter,
  UserSettingType,
  createStorageError,
} from './interface';
import { LiveDraftState, LiveDraftPick } from '@/app/storage/savedLiveDraftTypes';
import { DexieStorageAdapter } from './dexie';
import { MemoryStorageAdapter } from './memory';
import {
  StoredLeaguesDataCurrent,
  StoredMocksDataCurrent,
  StoredDraftDataCurrent,
  RosterSelections,
  EstimationSettingsState,
  SearchSettingsState,
} from '@/types/storage';
import {
  transformLeaguesFromDatabase,
  transformLeagueToDatabase,
  transformMocksFromDatabase,
  transformDraftToDatabase,
} from './transforms';
// Import encryption utilities dynamically only when needed (server-side only)
type EspnAuth = { espnS2: string; swid: string };
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
 * Retry budget for expired access tokens, bounded well below maxRetries. See
 * isRetryableError: these are retried specifically so they don't fall through to the
 * local fallback adapter, and they fail fast enough that the attempts are nearly free.
 */
const EXPIRED_TOKEN_RETRIES = 2;

/**
 * SupabaseStorageAdapter implementation
 */
export class SupabaseStorageAdapter implements StorageAdapter {
  private readonly retryConfig: RetryConfig;
  private readonly fallbackAdapter?: StorageAdapter;

  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly userId: string,
    private readonly options?: { 
      fallbackToLocalStorage?: boolean;
      fallbackToDexie?: boolean;
      fallbackToMemory?: boolean;
      retryConfig?: Partial<RetryConfig>;
    }
  ) {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...options?.retryConfig };
    
    // Set up fallback adapter based on configuration
    if (options?.fallbackToDexie || options?.fallbackToLocalStorage) {
      this.fallbackAdapter = new DexieStorageAdapter(this.userId);
    } else if (options?.fallbackToMemory) {
      this.fallbackAdapter = new MemoryStorageAdapter();
    }
  }

  /**
   * Check if an error is retryable.
   *
   * Anything that returns false here falls straight through to the local fallback
   * adapter, whose contents can be a stale subset of the server's — so classes of
   * failure that routinely resolve themselves on a second attempt must be retried
   * rather than silently answered from IndexedDB.
   */
  private isRetryableError(error: any, attempt = 0): boolean {
    const errorMessage = error?.message?.toLowerCase?.() || '';

    // Don't retry on authentication/authorization errors
    if (error?.code === '42501' ||
        errorMessage.includes('rls') ||
        errorMessage.includes('row level security') ||
        errorMessage.includes('policy') ||
        errorMessage.includes('authorization') ||
        errorMessage.includes('access denied')) {
      return false;
    }

    // An expired access token is the normal first-request-after-a-long-idle failure.
    // supabase-js refreshes it in the background, so a backed-off retry usually
    // succeeds; these fail fast, so a couple of attempts are cheap.
    if (error?.code === 'PGRST301' ||
        errorMessage.includes('jwt') ||
        errorMessage.includes('token')) {
      return attempt < EXPIRED_TOKEN_RETRIES;
    }

    // Request timeouts stay non-retryable. Retrying one is tempting — it means the
    // server was reachable but slow, so the local fallback may well be a stale subset —
    // but each attempt burns a full timeout window, so a single retry doubles an
    // already-8s stall to ~17s before anything renders. Measured against the e2e
    // mock-draft suite that made things distinctly worse (34 failures vs 12 baseline,
    // cascading timeouts), so the faster degraded answer wins here.
    if (errorMessage.includes('timeout') &&
        !errorMessage.includes('connection timeout') &&
        !errorMessage.includes('network timeout')) {
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
      if (attempt < this.retryConfig.maxRetries && this.isRetryableError(error, attempt)) {
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

    const errorMessage = error?.message?.toLowerCase?.() || '';

    // Determine error type based on Supabase error
    if (error?.code === '42501' || errorMessage.includes('rls') || errorMessage.includes('policy')) {
      throw createStorageError('AUTH_ERROR', 'Access denied - user not authorized', error, { operation, ...context });
    }
    
    if (error?.code === 'PGRST301' || errorMessage.includes('jwt') || errorMessage.includes('network')) {
      throw createStorageError('NETWORK_ERROR', 'Network connection failed', error, { operation, ...context });
    }
    
    throw createStorageError('DATA_ERROR', `Database operation failed: ${operation}`, error, { operation, ...context });
  }

  /**
   * Execute a Supabase operation with timeout protection
   * @param operation The Promise or thenable to execute (supports Supabase query builders)
   * @param operationName Description for error messages (required)
   * @param timeoutMs Timeout in milliseconds (default: 8000ms)
   */
  private async withTimeout<T>(
    operation: Promise<T> | PromiseLike<T>, 
    operationName: string,
    timeoutMs: number = 8000
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${operationName} timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    
    return Promise.race([Promise.resolve(operation), timeoutPromise]);
  }

  /**
   * Execute operation with fallback to localStorage if enabled
   */
  private async withFallback<T>(
    operation: string,
    supabaseOperation: () => Promise<T>,
    fallbackOperation?: () => Promise<T>,
    context?: { leagueId?: LeagueId; rosterName?: string }
  ): Promise<T> {
    try {
      const result = await this.withRetry(operation, supabaseOperation, context);
      return result;
    } catch (error) {
      if (this.fallbackAdapter && fallbackOperation) {
        console.warn(`[SupabaseStorage] Supabase unavailable, falling back to localStorage for ${operation}`);
        try {
          const fallbackResult = await fallbackOperation();
          return fallbackResult;
        } catch (fallbackError) {
          console.error(`[SupabaseStorage] Fallback also failed for ${operation}:`, fallbackError);
          // Throw the original Supabase error, not the fallback error
          throw error;
        }
      }
      console.error(`[SupabaseStorage] No fallback available for ${operation}, throwing error`);
      throw error;
    }
  }

  /**
   * Load a user-level setting blob by type + key
   */
  async getUserSetting<T = unknown>(type: UserSettingType, key: string): Promise<T | undefined> {
    return this.withFallback(
      'getUserSetting',
      async () => {
        const { data, error } = await this.supabase
          .from('user_settings')
          .select('data')
          .eq('user_id', this.userId)
          .eq('type', type)
          .eq('key', key)
          .maybeSingle();

        if (error) {
          console.error(`[SupabaseAdapter] Supabase error in getUserSetting:`, error);
          throw error;
        }

        return (data?.data as T | undefined) ?? undefined;
      },
      () => this.fallbackAdapter!.getUserSetting<T>(type, key)
    );
  }

  /**
   * Persist a user-level setting blob by type + key (upsert)
   */
  async setUserSetting<T = unknown>(type: UserSettingType, key: string, data: T): Promise<void> {
    return this.withFallback(
      'setUserSetting',
      async () => {
        const { error } = await this.supabase
          .from('user_settings')
          .upsert({
            user_id: this.userId,
            type,
            key,
            data: data as any,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,type,key',
            ignoreDuplicates: false,
          });

        if (error) {
          console.error(`[SupabaseAdapter] Supabase error in setUserSetting:`, error);
          throw error;
        }
      },
      () => this.fallbackAdapter!.setUserSetting(type, key, data)
    );
  }

  /**
   * Load all saved leagues for the current user
   */
  async loadLeagues(): Promise<StoredLeaguesDataCurrent> {
    return this.withFallback(
      'loadLeagues',
      async () => {
        const { data, error } = await this.supabase
          .from('leagues')
          .select('*')
          .eq('user_id', this.userId);

        if (error) {
          console.error(`[SupabaseAdapter] Supabase error in loadLeagues:`, error);
          throw error;
        }

        return transformLeaguesFromDatabase(data || []);
      },
      () => this.fallbackAdapter!.loadLeagues()
    );
  }

  /**
   * Save a league configuration
   */
  async saveLeague(leagueId: LeagueId, league: PlatformLeague): Promise<void> {
    return this.withFallback(
      'saveLeague',
      async () => {
        const leagueData = transformLeagueToDatabase(leagueId, league, this.userId);
        
        // Handle ESPN auth encryption if present.
        //
        // Encryption is server-side only (it requires ENCRYPTION_KEY and the Node
        // crypto module). In the app, authenticated league saves are routed through
        // the /api/save-league server route, which uses this adapter via
        // createServerStorageAdapter() — so this path runs with `window` undefined.
        // If this adapter is ever used to save an ESPN league with auth from the
        // browser, fail loudly with an actionable message rather than throwing a
        // cryptic crypto error (or, worse, silently persisting plaintext credentials).
        let authDataEncrypted: string | null = null;
        if (league.platform === 'espn' && 'auth' in league && league.auth) {
          // Encryption is server-only (requires ENCRYPTION_KEY + Node crypto module).
          // In production, authenticated ESPN league saves route through /api/save-league
          // which uses createServerStorageAdapter(), so this code runs in Node.
          // If accidentally called from a browser context without ENCRYPTION_KEY set,
          // the dynamically-imported encryption/utils module will throw at validation time.
          const espnAuthData = league.auth as PlatformEspnAuth;
          const espnAuth: EspnAuth = {
            espnS2: espnAuthData.espnS2 || '',
            swid: espnAuthData.swid || ''
          };
          const { encryptEspnAuth } = await import('../encryption/utils');
          authDataEncrypted = await encryptEspnAuth(espnAuth);
        }

        // Create timeout promise with longer timeout for E2E tests
        const timeoutMs = process.env.NODE_ENV === 'test' ? 15000 : 5000;
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`League upsert timeout after ${timeoutMs}ms`)), timeoutMs);
        });
        
        // Create upsert promise
        const upsertPromise = this.supabase
          .from('leagues')
          .upsert({
            ...leagueData,
            auth_data_encrypted: authDataEncrypted
          }, {
            onConflict: 'user_id,league_id,platform',
            ignoreDuplicates: false  // Ensure upsert always updates or inserts
          })
          .select()
          .maybeSingle(); // Use maybeSingle instead of single to handle updates
        
        try {
          // Race between upsert and timeout
          const { data, error } = await Promise.race([
            upsertPromise,
            timeoutPromise.then(() => ({ data: null, error: new Error('Timeout') }))
          ]) as any;
          
          if (error) {
            console.error(`[SupabaseStorage] Upsert failed:`, error);
            throw error;
          }
          
        } catch (upsertError) {
          console.error(`[SupabaseStorage] Upsert exception:`, upsertError);
          throw upsertError;
        }
      },
      () => {
        // Note: ESPN auth data will be lost in localStorage fallback
        if (league.platform === 'espn' && 'auth' in league && league.auth) {
          console.warn('[SupabaseStorage] ESPN auth data cannot be encrypted in localStorage fallback');
          // Create a copy without auth for localStorage
          const { auth, ...leagueWithoutAuth } = league as any;
          return this.fallbackAdapter!.saveLeague(leagueId, leagueWithoutAuth);
        }
        return this.fallbackAdapter!.saveLeague(leagueId, league);
      },
      { leagueId }
    );
  }

  /**
   * Load a single league by ID
   */
  async loadLeague(leagueId: LeagueId): Promise<PlatformLeague | undefined> {
    return this.withFallback(
      'loadLeague',
      async () => {
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

        if (data.auth_data_encrypted && data.platform === 'espn') {
          try {
            const { decryptEspnAuth } = await import('../encryption/utils');
            const decryptedAuth = await decryptEspnAuth(data.auth_data_encrypted);
            
            (league as EspnLeague).auth = {
              espnS2: decryptedAuth.espnS2,
              swid: decryptedAuth.swid
            };
          } catch (decryptError) {
            console.warn('[SupabaseStorage.loadLeague] Failed to decrypt auth data:', decryptError);
            // Continue without auth data rather than failing completely
          }
        }

        return league;
      },
      () => this.fallbackAdapter!.loadLeague(leagueId),
      { leagueId }
    );
  }

  /**
   * Load all saved mock drafts for a specific league
   */
  async loadSavedMocks(leagueId: LeagueId): Promise<StoredMocksDataCurrent> {
    return this.withFallback(
      'loadSavedMocks',
      async () => {
        // First get the league database ID with timeout protection
        const { data: leagues, error: leagueError } = await this.withTimeout(
          this.supabase
            .from('leagues')
            .select('id')
            .eq('user_id', this.userId)
            .eq('league_id', leagueId.toString())
            .single(),
          'loadSavedMocks leagues query'
        );

        if (leagueError) {
          if (leagueError.code === 'PGRST116') { // No league found
            return {};
          }
          throw leagueError;
        }

        const leagueDbId = leagues.id;

        // Get all draft sessions for this league with timeout protection
        const { data: sessions, error: sessionsError } = await this.withTimeout(
          this.supabase
            .from('draft_sessions')
            .select('*')
            .eq('league_id', leagueDbId),
          'loadSavedMocks sessions query'
        );

        if (sessionsError) throw sessionsError;

        if (!sessions || sessions.length === 0) {
          return {};
        }

        const sessionIds = sessions.map(s => s.id);

        // Get all related data in parallel with timeout protection
        const [
          { data: settings, error: settingsError },
          { data: selections, error: selectionsError },
          { data: adjustments, error: adjustmentsError }
        ] = await this.withTimeout(
          Promise.all([
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
          ]),
          'loadSavedMocks parallel queries',
          10000 // Longer timeout for parallel queries
        );

        if (settingsError) throw settingsError;
        if (selectionsError) throw selectionsError;
        if (adjustmentsError) throw adjustmentsError;

        return transformMocksFromDatabase(
          sessions,
          settings || [],
          selections || [],
          adjustments || []
        );
      },
      () => this.fallbackAdapter!.loadSavedMocks(leagueId),
      { leagueId }
    );
  }

  /**
   * Save mock draft data for a league
   */
  async saveMock(leagueId: LeagueId, data: StoredMocksDataCurrent): Promise<void> {
    return this.withFallback(
      'saveMock',
      async () => {
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
      },
      () => this.fallbackAdapter!.saveMock(leagueId, data),
      { leagueId }
    );
  }

  /**
   * Load a specific draft by name within a league
   */
  async loadDraftByName(leagueId: LeagueId, rosterName: string): Promise<StoredDraftDataCurrent | undefined> {
    return this.withFallback(
      'loadDraftByName',
      async () => {
        const mocks = await this.loadSavedMocks(leagueId);
        return mocks[rosterName];
      },
      () => this.fallbackAdapter!.loadDraftByName(leagueId, rosterName),
      { leagueId, rosterName }
    );
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
    return this.withFallback(
      'saveSelectedRoster',
      async () => {
        // Get the league database ID with timeout protection
        const { data: leagues, error: leagueError } = await this.withTimeout(
          this.supabase
            .from('leagues')
            .select('id')
            .eq('user_id', this.userId)
            .eq('league_id', leagueId.toString())
            .single(),
          'saveSelectedRoster leagues query'
        );

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

        // Use a transaction to ensure consistency with timeout protection
        const { data: session, error: sessionError } = await this.withTimeout(
          this.supabase
            .from('draft_sessions')
            .upsert({
              ...transformed.session,
              user_id: this.userId,
              league_id: leagueDbId
            }, {
              onConflict: 'user_id,league_id,name'
            })
            .select('id')
            .single(),
          'saveSelectedRoster session upsert'
        );

        if (sessionError) throw sessionError;
        const sessionId = session.id;

        // Delete existing related data with timeout protection
        await this.withTimeout(
          Promise.all([
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
          ]),
          'saveSelectedRoster delete operations'
        );

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

        const results = await this.withTimeout(
          Promise.all(insertPromises),
          'saveSelectedRoster insert operations'
        );
        for (const result of results) {
          if (result.error) throw result.error;
        }
      },
      () => this.fallbackAdapter!.saveSelectedRoster(
        leagueId,
        rosterName,
        rosterSelections,
        costAdjustments,
        estimationSettings,
        searchSettings,
        notes
      ),
      { leagueId, rosterName }
    );
  }

  /**
   * Delete a specific roster/draft
   */
  async deleteRoster(leagueId: LeagueId, rosterName: string): Promise<void> {
    return this.withFallback(
      'deleteRoster',
      async () => {
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
      },
      () => this.fallbackAdapter!.deleteRoster(leagueId, rosterName),
      { leagueId, rosterName }
    );
  }

  /**
   * Clear all data for the current user from Supabase
   * This removes all leagues, drafts, and associated data
   */
  async clearAllData(): Promise<void> {
    return this.withFallback(
      'clearAllData',
      async () => {

        // Get all draft sessions for this user first (for proper cascade deletion)
        const { data: draftSessions } = await this.supabase
          .from('draft_sessions')
          .select('id')
          .eq('user_id', this.userId);

        const sessionIds = draftSessions?.map(session => session.id) || [];

        // Delete in reverse dependency order to avoid foreign key violations
        if (sessionIds.length > 0) {
          // Delete cost adjustments
          await this.supabase
            .from('cost_adjustments')
            .delete()
            .in('draft_session_id', sessionIds);

          // Delete player selections
          await this.supabase
            .from('player_selections')
            .delete()
            .in('draft_session_id', sessionIds);

          // Delete draft settings
          await this.supabase
            .from('draft_settings')
            .delete()
            .in('draft_session_id', sessionIds);
        }

        // Delete all draft sessions for this user
        await this.supabase
          .from('draft_sessions')
          .delete()
          .eq('user_id', this.userId);

        // Delete all leagues for this user
        await this.supabase
          .from('leagues')
          .delete()
          .eq('user_id', this.userId);

      },
      async () => {
        if (this.fallbackAdapter) {
          await this.fallbackAdapter.clearAllData();
        }
      }
    );
  }

  // Live Draft Methods

  async loadLiveDrafts(leagueId: LeagueId): Promise<LiveDraftState[]> {
    return this.withFallback(
      'loadLiveDrafts',
      async () => {
        // Get league UUID first
        const leagueResponse = await this.supabase
          .from('leagues')
          .select('id')
          .eq('user_id', this.userId)
          .eq('league_id', leagueId)
          .single();

        if (leagueResponse.error) {
          return []; // No league found
        }

        // Load live drafts with picks and teams
        const draftsResponse = await this.supabase
          .from('live_drafts')
          .select(`
            *,
            live_draft_picks (*),
            live_draft_teams (*)
          `)
          .eq('user_id', this.userId)
          .eq('league_id', leagueResponse.data.id);

        if (draftsResponse.error) {
          throw new Error(`Failed to load live drafts: ${draftsResponse.error.message}`);
        }

        // Transform to LiveDraftState format
        return draftsResponse.data.map(draft => {
          const picks = draft.live_draft_picks.map(pick => ({
            pickNumber: pick.pick_number,
            teamId: pick.team_id,
            teamName: pick.team_name,
            player: {
              id: pick.player_id,
              name: pick.player_name,
              defaultPosition: pick.player_position,
              positions: [pick.player_position],
              overallRank: 0,
              positionRank: 0
            },
            price: pick.price,
            timestamp: new Date(pick.timestamp || '')
          }));

          const teams = draft.live_draft_teams.map(team => ({
            id: team.team_id,
            name: team.team_name,
            budget: team.budget,
            remainingBudget: team.remaining_budget,
            rosterSlots: team.roster_slots ? JSON.parse(team.roster_slots as string) : [],
            filledPositions: team.filled_positions ? JSON.parse(team.filled_positions as string) : {}
          }));

          return {
            leagueId: leagueId,
            draftId: draft.draft_id,
            draftName: draft.draft_name,
            created: new Date(draft.created_at || '').getTime(),
            modified: new Date(draft.updated_at || '').getTime(),
            picks,
            teams,
            currentPickNumber: draft.current_pick_number || 1,
            settings: draft.settings ? JSON.parse(draft.settings as string) : {},
            stateSnapshot: {
              pickNumber: draft.current_pick_number || 1,
              totalBudgetSpentPct: this.calculateTotalBudgetSpentPct(picks, teams),
              budgetSpentByPositionPct: {},
              playersPickedByPosition: {},
              budgetDistribution: {
                averageRemainingPct: this.calculateAverageRemainingPct(teams),
                medianRemainingPct: 0,
                minRemainingPct: this.calculateMinRemainingPct(teams),
                maxRemainingPct: this.calculateMaxRemainingPct(teams),
                teamsWithLowBudgetPct: 0
              },
              positionScarcityMetrics: {}
            }
          };
        });
      },
      async () => {
        return this.fallbackAdapter?.loadLiveDrafts(leagueId) || [];
      }
    );
  }

  async loadLiveDraft(leagueId: LeagueId, draftId: string): Promise<LiveDraftState | undefined> {
    return this.withFallback(
      'loadLiveDraft',
      async () => {
        const drafts = await this.loadLiveDrafts(leagueId);
        return drafts.find(d => d.draftId === draftId);
      },
      async () => {
        return this.fallbackAdapter?.loadLiveDraft(leagueId, draftId);
      }
    );
  }

  async saveLiveDraft(leagueId: LeagueId, draftState: LiveDraftState): Promise<void> {
    return this.withFallback(
      'saveLiveDraft',
      async () => {
        // Get league UUID first
        const leagueResponse = await this.supabase
          .from('leagues')
          .select('id')
          .eq('user_id', this.userId)
          .eq('league_id', leagueId)
          .single();

        if (leagueResponse.error) {
          throw new Error(`League ${leagueId} not found for user`);
        }

        const leagueUuid = leagueResponse.data.id;

        try {
          // Check if live draft already exists
          const existingDraft = await this.supabase
            .from('live_drafts')
            .select('id')
            .eq('user_id', this.userId)
            .eq('league_id', leagueUuid)
            .eq('draft_id', draftState.draftId)
            .single();

          let liveDraftId: string;

          if (existingDraft.data) {
            // Update existing draft
            liveDraftId = existingDraft.data.id;
            const updateResponse = await this.supabase
              .from('live_drafts')
              .update({
                draft_name: draftState.draftName,
                current_pick_number: draftState.currentPickNumber,
                settings: JSON.stringify(draftState.settings),
                updated_at: new Date().toISOString()
              })
              .eq('id', liveDraftId);

            if (updateResponse.error) {
              throw updateResponse.error;
            }

            // Delete existing picks and teams for clean update
            await this.supabase.from('live_draft_picks').delete().eq('live_draft_id', liveDraftId);
            await this.supabase.from('live_draft_teams').delete().eq('live_draft_id', liveDraftId);
          } else {
            // Create new draft
            const insertResponse = await this.supabase
              .from('live_drafts')
              .insert({
                user_id: this.userId,
                league_id: leagueUuid,
                draft_id: draftState.draftId,
                draft_name: draftState.draftName,
                current_pick_number: draftState.currentPickNumber,
                settings: JSON.stringify(draftState.settings)
              })
              .select('id')
              .single();

            if (insertResponse.error) {
              throw insertResponse.error;
            }

            liveDraftId = insertResponse.data.id;
          }

          // Insert picks
          if (draftState.picks.length > 0) {
            const picksToInsert = draftState.picks.map(pick => ({
              live_draft_id: liveDraftId,
              pick_number: pick.pickNumber,
              team_id: pick.teamId,
              team_name: pick.teamName,
              player_id: pick.player.id,
              player_name: pick.player.name,
              player_position: pick.player.defaultPosition,
              price: pick.price,
              timestamp: pick.timestamp.toISOString()
            }));

            const picksResponse = await this.supabase
              .from('live_draft_picks')
              .insert(picksToInsert);

            if (picksResponse.error) {
              throw picksResponse.error;
            }
          }

          // Insert teams
          if (draftState.teams.length > 0) {
            const teamsToInsert = draftState.teams.map(team => ({
              live_draft_id: liveDraftId,
              team_id: team.id,
              team_name: team.name,
              budget: team.budget,
              remaining_budget: team.remainingBudget,
              roster_slots: JSON.stringify(team.rosterSlots),
              filled_positions: JSON.stringify(team.filledPositions)
            }));

            const teamsResponse = await this.supabase
              .from('live_draft_teams')
              .insert(teamsToInsert);

            if (teamsResponse.error) {
              throw teamsResponse.error;
            }
          }

        } catch (error) {
          throw error;
        }
      },
      async () => {
        if (this.fallbackAdapter) {
          await this.fallbackAdapter.saveLiveDraft(leagueId, draftState);
        }
      }
    );
  }

  async addLiveDraftPick(leagueId: LeagueId, draftId: string, pick: LiveDraftPick): Promise<void> {
    return this.withFallback(
      'addLiveDraftPick',
      async () => {
        const draft = await this.loadLiveDraft(leagueId, draftId);
        if (!draft) {
          throw new Error(`Live draft ${draftId} not found in league ${leagueId}`);
        }

        draft.picks.push(pick);
        draft.currentPickNumber = Math.max(draft.currentPickNumber, pick.pickNumber + 1);
        await this.saveLiveDraft(leagueId, draft);
      },
      async () => {
        if (this.fallbackAdapter) {
          await this.fallbackAdapter.addLiveDraftPick(leagueId, draftId, pick);
        }
      }
    );
  }

  async updateLiveDraftPick(leagueId: LeagueId, draftId: string, pickNumber: number, updatedPick: LiveDraftPick): Promise<void> {
    return this.withFallback(
      'liveDraftOperation',
      async () => {
        const draft = await this.loadLiveDraft(leagueId, draftId);
        if (!draft) {
          throw new Error(`Live draft ${draftId} not found in league ${leagueId}`);
        }

        const pickIndex = draft.picks.findIndex(p => p.pickNumber === pickNumber);
        if (pickIndex === -1) {
          throw new Error(`Pick ${pickNumber} not found in draft ${draftId}`);
        }

        draft.picks[pickIndex] = updatedPick;
        await this.saveLiveDraft(leagueId, draft);
      },
      async () => {
        if (this.fallbackAdapter) {
          await this.fallbackAdapter.updateLiveDraftPick(leagueId, draftId, pickNumber, updatedPick);
        }
      }
    );
  }

  async deleteLiveDraftPick(leagueId: LeagueId, draftId: string, pickNumber: number): Promise<void> {
    return this.withFallback(
      'liveDraftOperation',
      async () => {
        const draft = await this.loadLiveDraft(leagueId, draftId);
        if (!draft) {
          throw new Error(`Live draft ${draftId} not found in league ${leagueId}`);
        }

        const pickIndex = draft.picks.findIndex(p => p.pickNumber === pickNumber);
        if (pickIndex === -1) {
          throw new Error(`Pick ${pickNumber} not found in draft ${draftId}`);
        }

        draft.picks.splice(pickIndex, 1);
        await this.saveLiveDraft(leagueId, draft);
      },
      async () => {
        if (this.fallbackAdapter) {
          await this.fallbackAdapter.deleteLiveDraftPick(leagueId, draftId, pickNumber);
        }
      }
    );
  }

  async deleteLiveDraft(leagueId: LeagueId, draftId: string): Promise<void> {
    return this.withFallback(
      'liveDraftOperation',
      async () => {
        // First get the league database ID since we need it for the foreign key
        const leagueDbIdResponse = await this.supabase
          .from('leagues')
          .select('id')
          .eq('user_id', this.userId)
          .eq('league_id', leagueId)
          .single();

        if (leagueDbIdResponse.error || !leagueDbIdResponse.data) {
          throw new Error(`League ${leagueId} not found: ${leagueDbIdResponse.error?.message || 'No data'}`);
        }

        const deleteResponse = await this.supabase
          .from('live_drafts')
          .delete()
          .eq('user_id', this.userId)
          .eq('league_id', leagueDbIdResponse.data.id)
          .eq('draft_id', draftId);

        if (deleteResponse.error) {
          throw new Error(`Failed to delete live draft: ${deleteResponse.error.message}`);
        }
      },
      async () => {
        if (this.fallbackAdapter) {
          await this.fallbackAdapter.deleteLiveDraft(leagueId, draftId);
        }
      }
    );
  }

  // Helper methods for percentage calculations
  private calculateTotalBudgetSpentPct(picks: any[], teams: any[]): number {
    const totalSpent = picks.reduce((sum, pick) => sum + pick.price, 0);
    const totalLeagueBudget = teams.reduce((sum, team) => sum + (team.budget || 200), 0);
    return totalLeagueBudget > 0 ? totalSpent / totalLeagueBudget : 0;
  }

  private calculateAverageRemainingPct(teams: any[]): number {
    if (teams.length === 0) return 0;
    const totalRemaining = teams.reduce((sum, team) => sum + (team.remainingBudget || 0), 0);
    const totalOriginalBudget = teams.reduce((sum, team) => sum + (team.budget || 200), 0);
    return totalOriginalBudget > 0 ? totalRemaining / totalOriginalBudget : 0;
  }

  private calculateMinRemainingPct(teams: any[]): number {
    if (teams.length === 0) return 0;
    const minRemaining = Math.min(...teams.map(t => t.remainingBudget || 0));
    const avgBudget = teams.reduce((sum, team) => sum + (team.budget || 200), 0) / teams.length;
    return avgBudget > 0 ? minRemaining / avgBudget : 0;
  }

  private calculateMaxRemainingPct(teams: any[]): number {
    if (teams.length === 0) return 0;
    const maxRemaining = Math.max(...teams.map(t => t.remainingBudget || 0));
    const avgBudget = teams.reduce((sum, team) => sum + (team.budget || 200), 0) / teams.length;
    return avgBudget > 0 ? maxRemaining / avgBudget : 0;
  }
}