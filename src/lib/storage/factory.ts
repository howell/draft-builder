import { StorageAdapter, StorageConfig, createStorageError } from './interface';
import { LocalStorageAdapter } from './localStorage';
import { MemoryStorageAdapter } from './memory';
import { SupabaseStorageAdapter } from './supabase';
import { DexieStorageAdapter } from './dexie';
import { supabase } from '@/lib/supabase';

/**
 * Factory function to create storage adapters based on configuration.
 * This allows switching between storage backends while maintaining the same interface.
 * 
 * @param config - Configuration object specifying the storage adapter type and options
 * @param config.type - The type of storage adapter ('localStorage' | 'memory' | 'dexie' | 'supabase')
 * @param config.supabase - Supabase client instance (required for 'supabase' type)
 * @param config.userId - User identifier for multi-user adapters (required for 'supabase' and 'dexie')
 * @param config.fallback - Fallback adapter type when primary storage fails ('localStorage' | 'dexie' | 'memory')
 * @param config.retryConfig - Retry configuration for network operations
 * @param config.encryptionKey - Optional encryption key for sensitive data
 * 
 * @returns A storage adapter instance implementing the StorageAdapter interface
 * @throws {StorageError} When configuration is invalid or adapter creation fails
 * 
 * @example
 * ```typescript
 * // Create localStorage adapter (default)
 * const localStorage = createStorageAdapter();
 * 
 * // Create Supabase adapter with Dexie fallback
 * const supabase = createStorageAdapter({
 *   type: 'supabase',
 *   supabase: supabaseClient,
 *   userId: 'user-123',
 *   fallback: 'dexie',
 *   retryConfig: { maxRetries: 3, backoffMs: 1000 }
 * });
 * 
 * // Create Dexie adapter for anonymous user
 * const dexie = createStorageAdapter({
 *   type: 'dexie',
 *   userId: 'anonymous'
 * });
 * ```
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
      // Validate userId format if provided
      if (config?.userId && typeof config.userId !== 'string') {
        throw createStorageError(
          'UNKNOWN_ERROR',
          'Invalid userId provided for Dexie adapter. Expected a string value.',
          undefined,
          { operation: 'createStorageAdapter' }
        );
      }
      return new DexieStorageAdapter(config?.userId || 'anonymous');
    
    case 'supabase':
      // Enhanced validation with specific error messages
      if (!config?.supabase) {
        throw createStorageError(
          'AUTH_ERROR',
          'Supabase client is required for supabase adapter. Please provide a valid Supabase client instance.',
          undefined,
          { operation: 'createStorageAdapter' }
        );
      }
      
      if (!config?.userId) {
        throw createStorageError(
          'AUTH_ERROR',
          'User ID is required for supabase adapter. Please ensure user is authenticated before creating adapter.',
          undefined,
          { operation: 'createStorageAdapter' }
        );
      }
      
      if (typeof config.supabase !== 'object' || typeof config.supabase.from !== 'function') {
        throw createStorageError(
          'AUTH_ERROR',
          'Invalid Supabase client provided. Expected a properly initialized Supabase client with database operations.',
          undefined,
          { operation: 'createStorageAdapter' }
        );
      }
      
      // Validate fallback configuration if provided
      if (config.fallback && !['localStorage', 'dexie', 'memory'].includes(config.fallback)) {
        throw createStorageError(
          'UNKNOWN_ERROR',
          `Invalid fallback adapter type: ${config.fallback}. Supported types are: localStorage, dexie, memory`,
          undefined,
          { operation: 'createStorageAdapter' }
        );
      }
      
      // Validate retry configuration if provided
      if (config.retryConfig) {
        if (typeof config.retryConfig.maxRetries !== 'undefined' && 
            (typeof config.retryConfig.maxRetries !== 'number' || config.retryConfig.maxRetries < 0)) {
          throw createStorageError(
            'UNKNOWN_ERROR',
            'Invalid retry configuration: maxRetries must be a non-negative number',
            undefined,
            { operation: 'createStorageAdapter' }
          );
        }
        
        if (typeof config.retryConfig.backoffMs !== 'undefined' && 
            (typeof config.retryConfig.backoffMs !== 'number' || config.retryConfig.backoffMs < 0)) {
          throw createStorageError(
            'UNKNOWN_ERROR',
            'Invalid retry configuration: backoffMs must be a non-negative number',
            undefined,
            { operation: 'createStorageAdapter' }
          );
        }
      }
      
      return new SupabaseStorageAdapter(config.supabase, config.userId, {
        fallbackToLocalStorage: config.fallback === 'localStorage',
        fallbackToDexie: config.fallback === 'dexie',
        fallbackToMemory: config.fallback === 'memory',
        retryConfig: config.retryConfig
      });
    
    default:
      throw createStorageError(
        'UNKNOWN_ERROR',
        `Unknown storage adapter type: ${type}. Supported types are: localStorage, memory, dexie, supabase`,
        undefined,
        { operation: 'createStorageAdapter' }
      );
  }
}

/**
 * Factory function specifically for testing that always returns a MemoryStorageAdapter.
 * This adapter stores data in-memory and provides isolated state for each test.
 * 
 * @returns A new MemoryStorageAdapter instance with clean state
 * 
 * @example
 * ```typescript
 * // Use in tests for isolated storage
 * const testAdapter = createTestStorageAdapter();
 * await testAdapter.saveLeague('test-league', { platform: 'sleeper', id: 'test' });
 * ```
 */
export function createTestStorageAdapter(): MemoryStorageAdapter {
  return new MemoryStorageAdapter();
}

/**
 * Get the default storage adapter for the current environment.
 * This is the main entry point for application code that automatically
 * selects the appropriate storage backend based on environment.
 * 
 * @returns A storage adapter appropriate for the current environment:
 *   - Server-side: MemoryStorageAdapter (SSR-safe)
 *   - Test environment: MemoryStorageAdapter (isolated state)
 *   - Client-side: LocalStorageAdapter (persistent storage)
 * 
 * @example
 * ```typescript
 * // Simple usage - automatically selects best adapter
 * const adapter = getDefaultStorageAdapter();
 * await adapter.loadLeagues();
 * ```
 * 
 * @future In Phase 3, this will include logic for feature flags and user preferences
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
 * Type guard to check if an adapter is the memory adapter.
 * Useful for tests and conditional logic based on adapter type.
 * 
 * @param adapter - The storage adapter to check
 * @returns True if the adapter is a MemoryStorageAdapter
 * 
 * @example
 * ```typescript
 * const adapter = getDefaultStorageAdapter();
 * if (isMemoryAdapter(adapter)) {
 *   // adapter is now typed as MemoryStorageAdapter
 *   console.log('Using in-memory storage');
 * }
 * ```
 */
export function isMemoryAdapter(adapter: StorageAdapter): adapter is MemoryStorageAdapter {
  return adapter instanceof MemoryStorageAdapter;
}

/**
 * Type guard to check if an adapter is the localStorage adapter.
 * Useful for browser-specific logic and feature detection.
 * 
 * @param adapter - The storage adapter to check
 * @returns True if the adapter is a LocalStorageAdapter
 * 
 * @example
 * ```typescript
 * const adapter = createStorageAdapter({ type: 'localStorage' });
 * if (isLocalStorageAdapter(adapter)) {
 *   // adapter is now typed as LocalStorageAdapter
 *   console.log('Using browser localStorage');
 * }
 * ```
 */
export function isLocalStorageAdapter(adapter: StorageAdapter): adapter is LocalStorageAdapter {
  return adapter instanceof LocalStorageAdapter;
}

/**
 * Type guard to check if an adapter is the Supabase adapter.
 * Useful for network-aware logic and authentication checks.
 * 
 * @param adapter - The storage adapter to check
 * @returns True if the adapter is a SupabaseStorageAdapter
 * 
 * @example
 * ```typescript
 * const adapter = createStorageAdapter({ type: 'supabase', supabase, userId });
 * if (isSupabaseAdapter(adapter)) {
 *   // adapter is now typed as SupabaseStorageAdapter
 *   console.log('Using cloud storage with authentication');
 * }
 * ```
 */
export function isSupabaseAdapter(adapter: StorageAdapter): adapter is SupabaseStorageAdapter {
  return adapter instanceof SupabaseStorageAdapter;
}

/**
 * Type guard to check if an adapter is the Dexie adapter.
 * Useful for IndexedDB-specific logic and offline capabilities.
 * 
 * @param adapter - The storage adapter to check
 * @returns True if the adapter is a DexieStorageAdapter
 * 
 * @example
 * ```typescript
 * const adapter = createStorageAdapter({ type: 'dexie', userId: 'user-123' });
 * if (isDexieAdapter(adapter)) {
 *   // adapter is now typed as DexieStorageAdapter
 *   console.log('Using IndexedDB for local storage');
 * }
 * ```
 */
export function isDexieAdapter(adapter: StorageAdapter): adapter is DexieStorageAdapter {
  return adapter instanceof DexieStorageAdapter;
} 