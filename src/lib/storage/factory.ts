import { StorageAdapter, StorageConfig, createStorageError } from './interface';
import { LocalStorageAdapter } from './localStorage';
import { MemoryStorageAdapter } from './memory';

/**
 * Factory function to create storage adapters based on configuration
 * This allows switching between storage backends while maintaining the same interface
 */
export function createStorageAdapter(config?: StorageConfig): StorageAdapter {
  // Check if we're running server-side
  if (typeof window === 'undefined') {
    // SSR-safe behavior: return memory adapter for server-side rendering
    console.warn('[Storage] localStorage not available server-side, using memory adapter');
    return new MemoryStorageAdapter();
  }

  const type = config?.type || 'localStorage';
  
  switch (type) {
    case 'localStorage':
      return new LocalStorageAdapter();
    
    case 'supabase':
      // TODO: Implement in Phase 3
      // Wire unused config options for future use:
      if (config?.userId) {
        console.warn('[Storage] userId will be used in Supabase implementation (Phase 3)');
      }
      if (config?.encryptionKey) {
        console.warn('[Storage] encryptionKey will be used for ESPN auth encryption (Phase 3)');
      }
      if (config?.retryConfig) {
        console.warn('[Storage] retryConfig will be used for network error handling (Phase 3)');
      }
      throw createStorageError(
        'NOT_AVAILABLE_SSR',
        'Supabase storage adapter not yet implemented',
        undefined,
        { operation: 'createStorageAdapter' }
      );
    
    default:
      throw createStorageError(
        'UNKNOWN_ERROR',
        `Unknown storage adapter type: ${type}`,
        undefined,
        { operation: 'createStorageAdapter' }
      );
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
  // SSR-safe: always use memory adapter server-side
  if (typeof window === 'undefined') {
    return new MemoryStorageAdapter();
  }

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