/**
 * @jest-environment jsdom
 */

import { renderHook } from '@testing-library/react';
import { useStorageAdapter } from '../hooks';
import { MemoryStorageAdapter } from '../memory';
import { LocalStorageAdapter } from '../localStorage';
import { SupabaseStorageAdapter } from '../supabase';

// Mock the auth context module completely
const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/context', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock the Supabase client
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockReturnThis(),
  upsert: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis()
};

jest.mock('@/lib/supabase', () => ({
  supabase: mockSupabase,
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

  beforeAll(() => {
    // Mock window object for browser environment
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
      },
      writable: true,
    });
  });

  afterAll(() => {
    // Clean up window mock
    delete (window as any).localStorage;
  });

  describe('Server-side rendering', () => {
    it('returns memory adapter when window is undefined', () => {
      // Mock server-side environment
      const originalWindow = global.window;
      delete (global as any).window;

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

      const { result } = renderHook(() => useStorageAdapter());

      expect(result.current).toBeInstanceOf(MemoryStorageAdapter);

      // Restore window
      global.window = originalWindow;
    });
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
    it('returns localStorage adapter for anonymous users', () => {
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

      expect(result.current).toBeInstanceOf(LocalStorageAdapter);
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
      expect(result.current).toBeInstanceOf(LocalStorageAdapter);

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
      expect(result.current).toBeInstanceOf(LocalStorageAdapter);
    });

    it('transitions through loading state correctly', () => {
      const { result, rerender } = renderHook(() => useStorageAdapter());

      // Start with loading state
      mockUseAuth.mockReturnValue({
        user: null,
        session: null,
        loading: true,
        error: null,
        signIn: jest.fn(),
        signUp: jest.fn(),
        signOut: jest.fn(),
        resetPassword: jest.fn(),
        clearError: jest.fn(),
      });

      rerender();
      expect(result.current).toBeInstanceOf(MemoryStorageAdapter);

      // Finish loading with authenticated user
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
  });
});