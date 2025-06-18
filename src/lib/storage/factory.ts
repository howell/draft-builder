import { StorageAdapter, StorageConfig } from './interface';
import { LocalStorageAdapter } from './localStorage';
import { MemoryStorageAdapter } from './memory';

/**
 * Factory function to create storage adapters based on configuration
 * This allows switching between storage backends while maintaining the same interface
 */
export function createStorageAdapter(config?: StorageConfig): StorageAdapter {
  const type = config?.type || 'localStorage';
  
  switch (type) {
    case 'localStorage':
      return new LocalStorageAdapter();
    
    case 'supabase':
      // TODO: Implement in Phase 3
      throw new Error('Supabase storage adapter not yet implemented');
    
    default:
      throw new Error(`Unknown storage adapter type: ${type}`);
  }
}

/**
 * Factory function specifically for testing - always returns MemoryStorageAdapter
 */
export function createTestStorageAdapter(): MemoryStorageAdapter {
  return new MemoryStorageAdapter();
}

/**
 * Get the default storage adapter for the current environment
 * This is the main entry point for application code
 */
export function getDefaultStorageAdapter(): StorageAdapter {
  // In development/test, we might want to use different defaults
  if (process.env.NODE_ENV === 'test') {
    return createTestStorageAdapter();
  }
  
  // For now, always return localStorage adapter
  // In Phase 3, this will include logic for feature flags and user preferences
  return createStorageAdapter({ type: 'localStorage' });
}

/**
 * Type guard to check if an adapter is the memory adapter (useful for tests)
 */
export function isMemoryAdapter(adapter: StorageAdapter): adapter is MemoryStorageAdapter {
  return adapter instanceof MemoryStorageAdapter;
}

/**
 * Type guard to check if an adapter is the localStorage adapter
 */
export function isLocalStorageAdapter(adapter: StorageAdapter): adapter is LocalStorageAdapter {
  return adapter instanceof LocalStorageAdapter;
} 