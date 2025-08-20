'use client';

import { useAuth } from '../auth/context';
import { StorageAdapter } from './interface';

/**
 * React hook that provides an authentication-aware storage adapter.
 * 
 * This hook now simply returns the storage adapter from the auth context,
 * which manages storage adapter selection centrally to prevent cascade remounts
 * from multiple components independently calling useStorageAdapter().
 * 
 * Storage adapter selection is now handled in AuthProvider based on:
 * - Server-side rendering: Returns MemoryStorageAdapter
 * - Loading state: Returns MemoryStorageAdapter (temporary while loading)
 * - Authenticated user: Returns SupabaseStorageAdapter with Dexie fallback
 * - Anonymous user: Returns DexieStorageAdapter (better performance than localStorage)
 * 
 * @returns StorageAdapter instance appropriate for current auth state
 */
export function useStorageAdapter(): StorageAdapter {
  const { storageAdapter } = useAuth();
  return storageAdapter;
}