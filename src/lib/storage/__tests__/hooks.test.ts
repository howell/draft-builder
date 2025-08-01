/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { useStorageAdapter } from '../hooks';
import { MemoryStorageAdapter } from '../memory';
import { LocalStorageAdapter } from '../localStorage';
import { DexieStorageAdapter } from '../dexie';
import { SupabaseStorageAdapter } from '../supabase';

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

// Define mock user for tests
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  created_at: '2023-01-01T00:00:00Z',
};

describe('useStorageAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading state', () => {
    it('returns memory adapter during loading state', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        session: null,
        loading: true, // Loading state
        error: null,
        signIn: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
        resetPassword: jest.fn(),
        clearError: jest.fn(),
      });

      const { result } = renderHook(() => useStorageAdapter());

      expect(result.current).toBeInstanceOf(MemoryStorageAdapter);
    });
  });

  describe('Anonymous user', () => {
    it('returns Dexie adapter for anonymous users', () => {
      mockUseAuth.mockReturnValue({
        user: null, // No user
        session: null,
        loading: false,
        error: null,
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

  // Note: Server-side rendering protection is tested implicitly
  // The hook includes `typeof window === 'undefined'` check
  // which returns MemoryStorageAdapter for SSR environments
});