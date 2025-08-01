/**
 * Migration detection utilities for localStorage data
 * These utilities help detect and summarize existing localStorage data for migration preview
 */

import { LeagueId } from '@/platforms/common';
import { LocalStorageAdapter } from './localStorage';
import { SAVED_LEAGUES_KEY } from './constants';

/**
 * Summary of user data available for migration
 */
export interface DataSummary {
  /** Number of leagues configured */
  leagueCount: number;
  /** Number of draft sessions saved */
  draftCount: number;
  /** Total number of player selections across all drafts */
  totalSelections: number;
  /** Number of cost adjustments made */
  costAdjustments: number;
}

/**
 * Check if there is any localStorage data available for migration
 * This is a fast check that doesn't parse all the data
 */
export function hasLocalStorageData(): boolean {
  try {
    // Check if running in browser environment
    if (typeof window === 'undefined' || !window.localStorage) {
      return false;
    }
    
    // Check for leagues data
    const leagues = localStorage.getItem(SAVED_LEAGUES_KEY);
    if (leagues) {
      try {
        const parsed = JSON.parse(leagues);
        if (parsed && parsed.leagues && typeof parsed.leagues === 'object') {
          return Object.keys(parsed.leagues).length > 0;
        }
      } catch {
        // If parsing fails, assume no valid data
        return false;
      }
    }
    
    return false;
  } catch {
    // Any error means no accessible data
    return false;
  }
}

/**
 * Get a comprehensive summary of localStorage data for migration preview
 * This function analyzes all stored data and counts items
 */
export async function getLocalStorageDataSummary(): Promise<DataSummary> {
  try {
    // Initialize summary with zero counts
    const summary: DataSummary = {
      leagueCount: 0,
      draftCount: 0,
      totalSelections: 0,
      costAdjustments: 0
    };
    
    // Check if running in browser environment
    if (typeof window === 'undefined' || !window.localStorage) {
      return summary;
    }
    
    // Use LocalStorageAdapter for consistent data access
    const localAdapter = new LocalStorageAdapter();
    
    // Load leagues data
    let leagues;
    try {
      leagues = await localAdapter.loadLeagues();
    } catch (error) {
      console.warn('[MigrationUtils] Failed to load leagues data:', error);
      return summary;
    }
    
    // Count leagues
    const leagueIds = Object.keys(leagues.leagues);
    summary.leagueCount = leagueIds.length;
    
    // If no leagues, return early
    if (summary.leagueCount === 0) {
      return summary;
    }
    
    // Analyze each league's draft data
    for (const leagueId of leagueIds) {
      try {
        const mocks = await localAdapter.loadSavedMocks(leagueId as LeagueId);
        const draftNames = Object.keys(mocks);
        summary.draftCount += draftNames.length;
        
        // Count selections and adjustments in each draft
        for (const draftName of draftNames) {
          const draft = mocks[draftName];
          if (draft) {
            // Count player selections
            if (draft.rosterSelections && typeof draft.rosterSelections === 'object') {
              summary.totalSelections += Object.keys(draft.rosterSelections).length;
            }
            
            // Count cost adjustments
            if (draft.costAdjustments && typeof draft.costAdjustments === 'object') {
              summary.costAdjustments += Object.keys(draft.costAdjustments).length;
            }
          }
        }
      } catch (error) {
        console.warn(`[MigrationUtils] Failed to load mocks for league ${leagueId}:`, error);
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
      totalSelections: 0,
      costAdjustments: 0
    };
  }
}

/**
 * Check if localStorage data appears to be corrupted or invalid
 * This can help determine if migration should be attempted
 */
export function validateLocalStorageData(): { isValid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  try {
    // Check if running in browser environment
    if (typeof window === 'undefined' || !window.localStorage) {
      issues.push('localStorage not available');
      return { isValid: false, issues };
    }
    
    // Check leagues data structure
    const leaguesData = localStorage.getItem(SAVED_LEAGUES_KEY);
    if (leaguesData) {
      try {
        const parsed = JSON.parse(leaguesData);
        
        if (!parsed || typeof parsed !== 'object') {
          issues.push('Leagues data is not a valid object');
        } else {
          if (!parsed.schemaVersion) {
            issues.push('Leagues data missing schema version');
          }
          
          if (!parsed.leagues || typeof parsed.leagues !== 'object') {
            issues.push('Leagues data missing leagues object');
          } else {
            // Validate each league has required properties
            for (const [leagueId, league] of Object.entries(parsed.leagues)) {
              if (!league || typeof league !== 'object') {
                issues.push(`League ${leagueId} is not a valid object`);
                continue;
              }
              
              const l = league as any;
              if (!l.platform || !l.id) {
                issues.push(`League ${leagueId} missing required properties (platform, id)`);
              }
            }
          }
        }
      } catch (parseError) {
        issues.push('Leagues data is not valid JSON');
      }
    }
    
    return { isValid: issues.length === 0, issues };
  } catch (error) {
    issues.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { isValid: false, issues };
  }
}

/**
 * Clear all localStorage data - use with caution!
 * This is primarily intended for testing or post-migration cleanup
 */
export function clearLocalStorageData(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    
    // Remove leagues data
    localStorage.removeItem(SAVED_LEAGUES_KEY);
    
    // Remove in-progress selections if they exist
    const inProgressKey = '##IN_PROGRESS_SELECTIONS##';
    localStorage.removeItem(inProgressKey);
    
    // Find and remove league-specific mock data
    // This is more complex as we need to identify which keys are league IDs
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key !== SAVED_LEAGUES_KEY && key !== inProgressKey) {
        // Check if this looks like mock data by trying to parse it
        try {
          const data = localStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            if (parsed && parsed.schemaVersion && parsed.mocks) {
              keysToRemove.push(key);
            }
          }
        } catch {
          // If it doesn't parse as expected, leave it alone
        }
      }
    }
    
    // Remove identified mock data keys
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
    
    console.log(`[MigrationUtils] Cleared localStorage data. Removed ${keysToRemove.length + 1} keys.`);
  } catch (error) {
    console.error('[MigrationUtils] Error clearing localStorage data:', error);
    throw error;
  }
}