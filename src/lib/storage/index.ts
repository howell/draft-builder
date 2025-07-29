// Main storage interface and types
export type { 
  StorageAdapter, 
  StorageError, 
  StorageErrorCode, 
  StorageErrorContext,
  StorageConfig,
  StorageAdapterFactory 
} from './interface';
export { createStorageError, isStorageError } from './interface';

// Storage constants
export { IN_PROGRESS_SELECTIONS_KEY, SAVED_LEAGUES_KEY } from './constants';

// Migration utilities
export { migrateMocks, migrateLeagues } from './migrations';

// Utility functions
export { deepClone } from './utils/deepClone';

// Encryption utilities (for Supabase adapter)
export { encryptEspnAuth, decryptEspnAuth, testEncryption, generateEncryptionKey } from '../encryption/utils';
export type { EspnAuth, EncryptedData } from '../encryption/utils';

// Data transformation utilities (for Supabase adapter)
export { 
  transformLeaguesFromDatabase,
  transformLeagueToDatabase,
  transformMocksFromDatabase,
  transformDraftToDatabase,
  createLeagueQuery
} from './transforms';
export type {
  DatabaseLeague,
  DatabaseDraftSession,
  DatabaseDraftSettings,
  DatabasePlayerSelection,
  DatabaseCostAdjustment
} from './transforms';

// Storage adapter implementations
export { LocalStorageAdapter } from './localStorage';
export { MemoryStorageAdapter } from './memory';
export { SupabaseStorageAdapter } from './supabase';

// Factory functions
export { 
  createStorageAdapter, 
  createTestStorageAdapter, 
  getDefaultStorageAdapter,
  isMemoryAdapter,
  isLocalStorageAdapter,
  isSupabaseAdapter
} from './factory';

// Re-export storage types for convenience
export type {
  StoredLeaguesDataCurrent,
  StoredMocksDataCurrent,
  StoredDraftDataCurrent,
  RosterSelections,
  EstimationSettingsState,
  SearchSettingsState
} from '@/types/storage'; 