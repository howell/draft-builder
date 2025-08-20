/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { useStorageAdapter } from '../hooks';
import { MemoryStorageAdapter } from '../memory';
import { LocalStorageAdapter } from '../localStorage';
import { DexieStorageAdapter } from '../dexie';
import { SupabaseStorageAdapter } from '../supabase';
import { createStorageAdapter } from '../factory';

// Mock the auth context module completely
const mockUseAuth = jest.fn();
jest.mock('../../auth/context', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock the Supabase client
jest.mock('../../supabase', () => ({
  supabase: {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis()
  },
}));

// Mock the storage factory
jest.mock('../factory', () => ({
  createStorageAdapter: jest.fn(),
}));

// Define mock user for tests
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  created_at: '2023-01-01T00:00:00Z',
};

// Mock storage adapter instances
const mockDexieAdapter = new DexieStorageAdapter('anonymous');
const mockSupabaseAdapter = new SupabaseStorageAdapter(
  // Mock Supabase client
  {
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis()
  } as any,
  'user-123',
  { fallbackToDexie: true }
);

const mockCreateStorageAdapter = createStorageAdapter as jest.MockedFunction<typeof createStorageAdapter>;

describe('useStorageAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading state', () => {
    it('returns dexie adapter during loading state for consistency', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        session: null,
        loading: true, // Loading state
        error: null,
        storageAdapter: mockDexieAdapter, // Provide the storage adapter
        signIn: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
        resetPassword: jest.fn(),
        clearError: jest.fn(),
      });

      const { result } = renderHook(() => useStorageAdapter());

      // Fixed: Now consistently returns Dexie during loading to prevent race conditions
      expect(result.current).toBeInstanceOf(DexieStorageAdapter);
    });
  });

  describe('Anonymous user', () => {
    it('returns Dexie adapter for anonymous users', () => {
      mockUseAuth.mockReturnValue({
        user: null, // No user
        session: null,
        loading: false,
        error: null,
        storageAdapter: mockDexieAdapter, // Provide the storage adapter
        signIn: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
        resetPassword: jest.fn(),
        clearError: jest.fn(),
      });

      const { result } = renderHook(() => useStorageAdapter());

      expect(result.current).toBeInstanceOf(DexieStorageAdapter);
    });
  });

  describe('Authenticated user', () => {
    it('returns Supabase adapter for authenticated users', () => {
      mockUseAuth.mockReturnValue({
        user: mockUser, // Authenticated user
        session: { user: mockUser } as any,
        loading: false,
        error: null,
        storageAdapter: mockSupabaseAdapter, // Provide the storage adapter
        signIn: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
        resetPassword: jest.fn(),
        clearError: jest.fn(),
      });

      const { result } = renderHook(() => useStorageAdapter());

      expect(result.current).toBeInstanceOf(SupabaseStorageAdapter);
    });
  });

  describe('State transitions', () => {
    it('updates adapter when auth state changes from anonymous to authenticated', () => {
      const { result, rerender } = renderHook(() => useStorageAdapter());

      // Start with anonymous user
      mockUseAuth.mockReturnValue({
        user: null,
        session: null,
        loading: false,
        error: null,
        storageAdapter: mockDexieAdapter, // Provide the storage adapter
        signIn: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
        resetPassword: jest.fn(),
        clearError: jest.fn(),
      });

      rerender();
      expect(result.current).toBeInstanceOf(DexieStorageAdapter);

      // Change to authenticated user
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: { user: mockUser } as any,
        loading: false,
        error: null,
        storageAdapter: mockSupabaseAdapter, // Provide the storage adapter
        signIn: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
        resetPassword: jest.fn(),
        clearError: jest.fn(),
      });

      rerender();
      expect(result.current).toBeInstanceOf(SupabaseStorageAdapter);
    });

    it('updates adapter when auth state changes from authenticated to anonymous', () => {
      const { result, rerender } = renderHook(() => useStorageAdapter());

      // Start with authenticated user
      mockUseAuth.mockReturnValue({
        user: mockUser,
        session: { user: mockUser } as any,
        loading: false,
        error: null,
        storageAdapter: mockSupabaseAdapter, // Provide the storage adapter
        signIn: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
        resetPassword: jest.fn(),
        clearError: jest.fn(),
      });

      rerender();
      expect(result.current).toBeInstanceOf(SupabaseStorageAdapter);

      // Change to anonymous user
      mockUseAuth.mockReturnValue({
        user: null,
        session: null,
        loading: false,
        error: null,
        storageAdapter: mockDexieAdapter, // Provide the storage adapter
        signIn: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
        resetPassword: jest.fn(),
        clearError: jest.fn(),
      });

      rerender();
      expect(result.current).toBeInstanceOf(DexieStorageAdapter);
    });
  });

  // Note: Server-side rendering protection is handled in the auth context
  // The auth context includes `typeof window === 'undefined'` check
  // which returns MemoryStorageAdapter for SSR environments
  // These tests focus on client-side behavior where loading/anonymous states use Dexie
});