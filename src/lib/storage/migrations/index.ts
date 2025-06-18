/**
 * Migration utilities for storage data schema versions
 * These functions handle migrating data between different schema versions
 * to maintain backward compatibility when the storage format changes.
 */

export { default as migrateLeagues } from './leagues';
export { default as migrateMocks } from './mocks';

// Re-export migration types for use in other modules
export type {
  StoredLeaguesDataV2,
  StoredLeaguesDataV3,
  StoredLeaguesDataCurrent
} from './leagues';

export type {
  StoredDataV2,
  StoredDataV3,
  StoredDataV4,
  StoredDataCurrent,
  StoredMocksDataV3,
  StoredMocksDataV4,
  StoredDraftDataV3,
  StoredDraftDataV4
} from './mocks'; 