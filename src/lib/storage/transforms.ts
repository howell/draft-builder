/**
 * Data transformation functions for converting between localStorage format and Supabase database format
 */

import { LeagueId, PlatformLeague } from '@/platforms/common';
import {
  StoredLeaguesDataCurrent,
  StoredMocksDataCurrent,
  StoredDraftDataCurrent,
  RosterSelections,
  EstimationSettingsState,
  SearchSettingsState,
  CURRENT_LEAGUES_SCHEMA_VERSION,
  CURRENT_MOCKS_SCHEMA_VERSION
} from '@/types/storage';

import type { Database } from '@/lib/database.types';

/**
 * Database row types extracted from generated Supabase types
 */
export type DatabaseLeague = Database['public']['Tables']['leagues']['Row'];
export type DatabaseDraftSession = Database['public']['Tables']['draft_sessions']['Row'];
export type DatabaseDraftSettings = Database['public']['Tables']['draft_settings']['Row'];
export type DatabasePlayerSelection = Database['public']['Tables']['player_selections']['Row'];
export type DatabaseCostAdjustment = Database['public']['Tables']['cost_adjustments']['Row'];

/**
 * Transform database leagues to localStorage format
 */
export async function transformLeaguesFromDatabase(
  dbLeagues: DatabaseLeague[]
): Promise<StoredLeaguesDataCurrent> {
  const leagues: { [leagueId: LeagueId]: PlatformLeague } = {};
  
  for (const dbLeague of dbLeagues) {
    const league: PlatformLeague = {
      platform: dbLeague.platform as any,
      id: dbLeague.league_id as LeagueId,
    };

    // Decrypt ESPN auth if present
    if (dbLeague.auth_data_encrypted && dbLeague.platform === 'espn') {
      try {
        // Only decrypt on server side
        if (typeof window === 'undefined') {
          const { decryptEspnAuth } = await import('../encryption/utils');
          const decryptedAuth = await decryptEspnAuth(dbLeague.auth_data_encrypted);
          
          (league as any).auth = {
            espnS2: decryptedAuth.espnS2,
            swid: decryptedAuth.swid
          };
        } else {
          console.warn('[transformLeaguesFromDatabase] Decryption skipped on client side - auth data not available');
        }
      } catch (decryptError) {
        console.warn('[transformLeaguesFromDatabase] Failed to decrypt auth data for league', dbLeague.league_id, ':', decryptError);
        // Continue without auth data rather than failing completely
      }
    }
    
    leagues[dbLeague.league_id as LeagueId] = league;
  }
  
  return {
    schemaVersion: CURRENT_LEAGUES_SCHEMA_VERSION,
    leagues
  };
}

/**
 * Transform localStorage league to database format
 */
export function transformLeagueToDatabase(
  leagueId: LeagueId,
  league: PlatformLeague,
  userId: string
): Omit<DatabaseLeague, 'id' | 'created_at' | 'updated_at'> {
  return {
    user_id: userId,
    league_id: leagueId.toString(),
    platform: league.platform,
    auth_data_encrypted: null, // handled separately
  };
}

/**
 * Transform database drafts to localStorage mocks format
 */
export function transformMocksFromDatabase(
  draftSessions: DatabaseDraftSession[],
  draftSettings: DatabaseDraftSettings[],
  playerSelections: DatabasePlayerSelection[],
  costAdjustments: DatabaseCostAdjustment[]
): StoredMocksDataCurrent {
  const mocks: StoredMocksDataCurrent = {};
  
  // Create lookup maps for efficient joining
  const settingsMap = new Map<string, DatabaseDraftSettings>();
  const selectionsMap = new Map<string, DatabasePlayerSelection[]>();
  const adjustmentsMap = new Map<string, DatabaseCostAdjustment[]>();
  
  draftSettings.forEach(setting => {
    if (setting.draft_session_id) {
      settingsMap.set(setting.draft_session_id, setting);
    }
  });
  
  playerSelections.forEach(selection => {
    if (selection.draft_session_id) {
      const existing = selectionsMap.get(selection.draft_session_id) || [];
      existing.push(selection);
      selectionsMap.set(selection.draft_session_id, existing);
    }
  });
  
  costAdjustments.forEach(adjustment => {
    if (adjustment.draft_session_id) {
      const existing = adjustmentsMap.get(adjustment.draft_session_id) || [];
      existing.push(adjustment);
      adjustmentsMap.set(adjustment.draft_session_id, existing);
    }
  });
  
  // Transform each draft session
  for (const session of draftSessions) {
    const settings = settingsMap.get(session.id);
    const selections = selectionsMap.get(session.id) || [];
    const adjustments = adjustmentsMap.get(session.id) || [];
    
    // Transform player selections to roster format
    const rosterSelections: RosterSelections = {};
    for (const selection of selections) {
      rosterSelections[selection.roster_position] = {
        id: selection.player_id,
        name: selection.player_name,
        defaultPosition: selection.default_position,
        positions: selection.positions || [],
        overallRank: selection.overall_rank || 0,
        positionRank: selection.position_rank || 0,
        estimatedCost: selection.estimated_cost || 0
      };
    }
    
    // Transform cost adjustments
    const costAdjustmentMap: Record<string, number> = {};
    for (const adjustment of adjustments) {
      costAdjustmentMap[adjustment.roster_position] = adjustment.adjusted_cost;
    }
    
    // Transform settings or use defaults
    const estimationSettings: EstimationSettingsState = settings ? {
      years: (settings.estimation_years || []) as any[], // SeasonId[]
      weight: settings.estimation_weight || 0.5
    } : {
      years: [],
      weight: 0.5
    };
    
    const searchSettings: SearchSettingsState = settings ? {
      positions: settings.search_positions || [],
      playerCount: settings.search_player_count || 50,
      minPrice: settings.search_min_price || 0,
      maxPrice: settings.search_max_price || 999,
      showOnlyAvailable: settings.search_show_only_available || false
    } : {
      positions: [],
      playerCount: 50,
      minPrice: 0,
      maxPrice: 999,
      showOnlyAvailable: false
    };
    
    const draft: StoredDraftDataCurrent = {
      year: session.year as any, // SeasonId
      notes: session.notes || '',
      created: new Date(session.created_at || new Date()).getTime(),
      modified: new Date(session.updated_at || new Date()).getTime(),
      rosterSelections,
      costAdjustments: costAdjustmentMap,
      estimationSettings,
      searchSettings
    };
    
    mocks[session.name] = draft;
  }
  
  return mocks;
}

/**
 * Transform localStorage draft to database format
 */
export function transformDraftToDatabase(
  rosterName: string,
  draft: StoredDraftDataCurrent,
  userId: string,
  leagueDbId: string
): {
  session: Omit<DatabaseDraftSession, 'id' | 'created_at' | 'updated_at'>;
  settings: Omit<DatabaseDraftSettings, 'id' | 'draft_session_id' | 'created_at' | 'updated_at'>;
  selections: Omit<DatabasePlayerSelection, 'id' | 'draft_session_id' | 'selected_at'>[];
  adjustments: Omit<DatabaseCostAdjustment, 'id' | 'draft_session_id' | 'created_at' | 'updated_at'>[];
} {
  // Transform draft session
  const session: Omit<DatabaseDraftSession, 'id' | 'created_at' | 'updated_at'> = {
    user_id: userId,
    league_id: leagueDbId,
    name: rosterName,
    year: draft.year.toString(),
    notes: draft.notes || ''
  };
  
  // Transform draft settings
  const settings: Omit<DatabaseDraftSettings, 'id' | 'draft_session_id' | 'created_at' | 'updated_at'> = {
    estimation_years: draft.estimationSettings.years.map(y => y.toString()),
    estimation_weight: draft.estimationSettings.weight,
    search_positions: draft.searchSettings.positions,
    search_player_count: draft.searchSettings.playerCount,
    search_min_price: draft.searchSettings.minPrice,
    search_max_price: draft.searchSettings.maxPrice,
    search_show_only_available: draft.searchSettings.showOnlyAvailable
  };
  
  // Transform player selections
  const selections: Omit<DatabasePlayerSelection, 'id' | 'draft_session_id' | 'selected_at'>[] = [];
  for (const [rosterPosition, player] of Object.entries(draft.rosterSelections)) {
    if (player) {
      selections.push({
        roster_position: rosterPosition,
        player_id: player.id,
        player_name: player.name,
        default_position: player.defaultPosition,
        positions: player.positions,
        estimated_cost: player.estimatedCost,
        overall_rank: player.overallRank,
        position_rank: player.positionRank
      });
    }
  }
  
  // Transform cost adjustments
  const adjustments: Omit<DatabaseCostAdjustment, 'id' | 'draft_session_id' | 'created_at' | 'updated_at'>[] = [];
  for (const [rosterPosition, adjustedCost] of Object.entries(draft.costAdjustments)) {
    // Extract player_id from corresponding roster selection for reference
    const player = draft.rosterSelections[rosterPosition];
    if (player) {
      adjustments.push({
        roster_position: rosterPosition,
        player_id: player.id,
        adjusted_cost: adjustedCost
      });
    }
  }
  
  return {
    session,
    settings,
    selections,
    adjustments
  };
}

/**
 * Helper to get the database league ID from a platform league ID and user ID
 * This is used when we need to reference the database primary key
 */
export function createLeagueQuery(userId: string, leagueId: LeagueId) {
  return {
    user_id: userId,
    league_id: leagueId.toString()
  };
}