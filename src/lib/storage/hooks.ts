'use client';

import { useMemo } from 'react';
import { useAuth } from '../auth/context';
import { StorageAdapter } from './interface';
import { createStorageAdapter } from './factory';
import { MemoryStorageAdapter } from './memory';
import { supabase } from '../supabase';

/**
 * React hook that provides an authentication-aware storage adapter.
 * 
 * This hook automatically selects the appropriate storage backend based on:
 * - Server-side rendering: Returns MemoryStorageAdapter
 * - Loading state: Returns MemoryStorageAdapter (temporary while loading)
 * - Authenticated user: Returns SupabaseStorageAdapter with Dexie fallback
 * - Anonymous user: Returns DexieStorageAdapter (better performance than localStorage)
 * 
 * The hook uses useMemo to prevent unnecessary re-creation of adapters
 * and only updates when authentication state changes.
 * 
 * @returns StorageAdapter instance appropriate for current auth state
 */
export function useStorageAdapter(): StorageAdapter {
  const { user, loading } = useAuth();
  
  return useMemo(() => {
    // Server-side rendering protection
    if (typeof window === 'undefined') {
      return new MemoryStorageAdapter();
    }
    
    // While authentication is loading, use memory adapter temporarily
    // This prevents attempting to use localStorage or Supabase before
    // we know the user's authentication state
    if (loading) {
      return new MemoryStorageAdapter();
    }
    
    // Authenticated user: use Supabase storage with Dexie fallback for offline scenarios
    if (user) {
      return createStorageAdapter({
        type: 'supabase',
        supabase: supabase,
        userId: user.id,
        fallback: 'dexie' // Use Dexie instead of localStorage as fallback
      });
    }
    
    // Anonymous user: use Dexie for better performance than localStorage
    return createStorageAdapter({ 
      type: 'dexie', 
      userId: 'anonymous' // Anonymous users use Dexie for better performance
    });
  }, [user, loading]);
}