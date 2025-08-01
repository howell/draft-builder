import { StorageAdapter, StorageConfig, createStorageError } from './interface';
import { LocalStorageAdapter } from './localStorage';
import { MemoryStorageAdapter } from './memory';
import { SupabaseStorageAdapter } from './supabase';
import { DexieStorageAdapter } from './dexie';
import { supabase } from '@/lib/supabase';

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
    
    case 'memory':
      return new MemoryStorageAdapter();
    
    case 'dexie':
      return new DexieStorageAdapter(config?.userId || 'anonymous');
    
    case 'supabase':
      if (!config?.supabase || !config?.userId || typeof config.supabase !== 'object' || typeof config.supabase.from !== 'function') {
        throw createStorageError(
          'AUTH_ERROR',
          'Supabase client and userId are required for supabase adapter',
          undefined,
          { operation: 'createStorageAdapter' }
        );
      }
      return new SupabaseStorageAdapter(config.supabase, config.userId, config);
    
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

/**
 * Type guard to check if an adapter is the Supabase adapter
 */
export function isSupabaseAdapter(adapter: StorageAdapter): adapter is SupabaseStorageAdapter {
  return adapter instanceof SupabaseStorageAdapter;
}

/**
 * Type guard to check if an adapter is the Dexie adapter
 */
export function isDexieAdapter(adapter: StorageAdapter): adapter is DexieStorageAdapter {
  return adapter instanceof DexieStorageAdapter;
} 