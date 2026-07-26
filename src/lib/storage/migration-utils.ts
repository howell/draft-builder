/**
 * Migration detection utilities for Dexie (IndexedDB) data
 * These utilities help detect and summarize existing Dexie data for migration preview
 */

import { LeagueId } from '@/platforms/common';
import { DexieStorageAdapter } from './dexie';
import { isInProgressSelectionsKey } from './constants';
import { countMigratableAnonymousSettings } from './settings-migration';

/**
 * Summary of user data available for migration
 */
export interface DataSummary {
  /** Number of leagues configured */
  leagueCount: number;
  /** Number of draft sessions saved */
  draftCount: number;
  /** Number of saved settings blobs — ranking boards, price multipliers. */
  settingsCount: number;
}

/**
 * Check if there is any Dexie data available for migration
 * This function is async because Dexie operations are async
 */
export async function hasMigratableData(): Promise<boolean> {
  try {
    console.log('[MigrationUtils.hasMigratableData] Checking for migratable data...');
    
    // Check if running in browser environment
    if (typeof window === 'undefined') {
      console.log('[MigrationUtils.hasMigratableData] Not in browser environment');
      return false;
    }
    
    // Use DexieStorageAdapter for anonymous user
    const adapter = new DexieStorageAdapter('anonymous');
    
    // Load leagues using the adapter
    const leaguesData = await adapter.loadLeagues();
    const leagueIds = Object.keys(leaguesData.leagues);
    
    console.log('[MigrationUtils.hasMigratableData] Found leagues:', leagueIds.length);
    
    if (leagueIds.length > 0) {
      console.log(`[MigrationUtils.hasMigratableData] Found ${leagueIds.length} leagues:`, leagueIds);
      return true;
    }

    // Rankings and price multipliers are worth migrating on their own — a user
    // can have built a board without ever connecting a league.
    const settingsCount = await countMigratableAnonymousSettings();
    if (settingsCount > 0) {
      console.log(`[MigrationUtils.hasMigratableData] Found ${settingsCount} settings`);
      return true;
    }

    console.log('[MigrationUtils.hasMigratableData] No leagues or settings found');
    return false;
  } catch (error) {
    console.error('[MigrationUtils.hasMigratableData] Error checking for data:', error);
    // Any error means no accessible data
    return false;
  }
}


/**
 * Get a comprehensive summary of Dexie data for migration preview
 * This function analyzes all stored data and counts items
 */
export async function getLocalStorageDataSummary(): Promise<DataSummary> {
  try {
    console.log('[getLocalStorageDataSummary] Starting data summary generation...');
    
    // Initialize summary with zero counts
    const summary: DataSummary = {
      leagueCount: 0,
      draftCount: 0,
      settingsCount: 0
    };
    
    // Check if running in browser environment
    if (typeof window === 'undefined') {
      return summary;
    }
    
    // Counted before the league lookups below, which return early when there are
    // no leagues — a settings-only user must still be reported accurately.
    summary.settingsCount = await countMigratableAnonymousSettings();
    
    // Use DexieStorageAdapter for anonymous user
    const adapter = new DexieStorageAdapter('anonymous');
    
    // Get leagues for anonymous user
    let leaguesData;
    try {
      leaguesData = await adapter.loadLeagues();
      console.log('[MigrationUtils.getDataSummary] Loaded leagues:', Object.keys(leaguesData.leagues).length);
    } catch (error) {
      console.warn('[MigrationUtils.getDataSummary] Failed to load leagues data:', error);
      return summary;
    }
    
    // Count leagues
    const leagueIds = Object.keys(leaguesData.leagues);
    summary.leagueCount = leagueIds.length;
    console.log(`[MigrationUtils.getDataSummary] Found ${summary.leagueCount} leagues:`, leagueIds);
    
    // If no leagues, return early
    if (summary.leagueCount === 0) {
      return summary;
    }
    
    // Analyze each league's draft data using the adapter
    for (const leagueId of leagueIds) {
      try {
        // Load mocks/drafts for this league using the adapter
        const mocksData = await adapter.loadSavedMocks(leagueId as LeagueId);
        
        // Filter out in-progress selections from draft count
        const completedDrafts = Object.keys(mocksData).filter(draftName => {
          // Filter out any drafts that are in-progress selections
          return !isInProgressSelectionsKey(draftName);
        });
        
        summary.draftCount += completedDrafts.length;
      } catch (error) {
        console.warn(`[MigrationUtils] Failed to analyze league ${leagueId}:`, error);
        // Continue processing other leagues even if one fails
        continue;
      }
    }
    
    return summary;
  } catch (error) {
    console.error('[MigrationUtils] Error generating data summary:', error);
    // Return zero counts on any error
    return {
      leagueCount: 0,
      draftCount: 0,
      settingsCount: 0
    };
  }
}


/**
 * Clear all local data - use with caution!
 * This clears Dexie data for anonymous users and is primarily intended for post-migration cleanup
 */
export async function clearLocalStorageData(): Promise<void> {
  try {
    console.log('[MigrationUtils] Clearing local data...');
    
    if (typeof window === 'undefined') {
      console.log('[MigrationUtils] Not in browser environment, skipping data clear');
      return;
    }
    
    // Clear Dexie data for anonymous user
    const adapter = new DexieStorageAdapter('anonymous');
    await adapter.clearAllData();
    
    console.log('[MigrationUtils] ✅ Successfully cleared all local data');
  } catch (error) {
    console.error('[MigrationUtils] Error clearing local data:', error);
    throw error;
  }
}