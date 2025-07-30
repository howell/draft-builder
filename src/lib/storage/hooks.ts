'use client';

import { useMemo } from 'react';
import { useAuth } from '@/lib/auth/context';
import { StorageAdapter } from './interface';
import { createStorageAdapter } from './factory';
import { MemoryStorageAdapter } from './memory';
import { supabase } from '@/lib/supabase';

/**
 * React hook that provides an authentication-aware storage adapter.
 * 
 * This hook automatically selects the appropriate storage backend based on:
 * - Server-side rendering: Returns MemoryStorageAdapter
 * - Loading state: Returns MemoryStorageAdapter (temporary while loading)
 * - Authenticated user: Returns SupabaseStorageAdapter
 * - Anonymous user: Returns LocalStorageAdapter
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
    
    // Authenticated user: use Supabase storage with their user ID
    if (user) {
      return createStorageAdapter({
        type: 'supabase',
        supabase: supabase,
        userId: user.id
      });
    }
    
    // Anonymous user: use localStorage for backward compatibility
    return createStorageAdapter({ type: 'localStorage' });
  }, [user, loading]);
}