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

// Storage adapter implementations
export { LocalStorageAdapter } from './localStorage';
export { MemoryStorageAdapter } from './memory';

// Factory functions
export { 
  createStorageAdapter, 
  createTestStorageAdapter, 
  getDefaultStorageAdapter,
  isMemoryAdapter,
  isLocalStorageAdapter 
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