/**
 * Shared constants for storage operations
 * These constants define storage keys and other shared values used across storage adapters
 */

/** Key for storing leagues data in localStorage */
export const SAVED_LEAGUES_KEY = 'leagues';

/** Key for storing in-progress draft selections */
export const IN_PROGRESS_SELECTIONS_KEY = '##IN_PROGRESS_SELECTIONS##';

/** Current schema versions for data migration */
export const CURRENT_LEAGUES_SCHEMA_VERSION = 3;
export const CURRENT_MOCKS_SCHEMA_VERSION = 4; 