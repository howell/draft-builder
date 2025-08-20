/**
 * Shared constants for storage operations
 * These constants define storage keys and other shared values used across storage adapters
 */

/** Key for storing leagues data in localStorage */
export const SAVED_LEAGUES_KEY = 'leagues';

/** Legacy key for storing in-progress draft selections (deprecated) */
export const IN_PROGRESS_SELECTIONS_KEY = '##IN_PROGRESS_SELECTIONS##';

/** Creates a league-specific key for storing in-progress draft selections */
export function getInProgressSelectionsKey(leagueId: string): string {
  return `##IN_PROGRESS_SELECTIONS_${leagueId}##`;
}

/** Checks if a draft name is an in-progress selections key (legacy or league-specific) */
export function isInProgressSelectionsKey(draftName: string): boolean {
  return draftName === IN_PROGRESS_SELECTIONS_KEY || 
         draftName.startsWith('##IN_PROGRESS_SELECTIONS_');
}

/** Current schema versions for data migration */
export const CURRENT_LEAGUES_SCHEMA_VERSION = 3;
export const CURRENT_MOCKS_SCHEMA_VERSION = 4; 