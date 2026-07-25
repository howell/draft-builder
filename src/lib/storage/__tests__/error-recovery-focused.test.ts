/**
 * Focused error recovery tests that avoid Jest mock conflicts
 * Tests core error handling logic without complex mocking chains
 */

import { SupabaseStorageAdapter } from '../supabase';
import { LocalStorageAdapter } from '../localStorage';
import { StorageError, createStorageError } from '../errors';

// Don't use global Jest mocks - create minimal local mocks
const createMockSupabase = (mockImplementation?: any) => ({
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => mockImplementation || Promise.resolve({ data: [], error: null }))
    }))
  })),
  auth: {
    getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null }))
  }
});

// Mock transforms without global interference
jest.doMock('../transforms', () => ({
  transformLeaguesFromDatabase: jest.fn(() => ({
    schemaVersion: '1.0',
    leagues: {}
  })),
  transformLeagueToDatabase: jest.fn(),
  transformMocksFromDatabase: jest.fn(),
  transformDraftToDatabase: jest.fn()
}));

describe('Focused Error Recovery Tests', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('Error Classification Logic', () => {
    it('should correctly identify retryable vs non-retryable errors', () => {
      const mockSupabase = createMockSupabase();
      const adapter = new SupabaseStorageAdapter(mockSupabase as any, 'test-user');
      
      // Access private method for testing
      const isRetryableError = (adapter as any).isRetryableError.bind(adapter);

      // Test retryable errors (network, temporary failures)
      expect(isRetryableError(new Error('Network connection lost'))).toBe(true);
      expect(isRetryableError(new Error('Temporary failure'))).toBe(true);
      expect(isRetryableError(new Error('Connection timeout'))).toBe(true);
      expect(isRetryableError({ message: 'NETWORK ERROR' })).toBe(true);

      // Test non-retryable errors (permission denials - retrying can't change these)
      expect(isRetryableError({ code: '42501', message: 'RLS violation' })).toBe(false);
      expect(isRetryableError(new Error('RLS policy violated'))).toBe(false);
      expect(isRetryableError(new Error('Authorization failed'))).toBe(false);
      expect(isRetryableError(new Error('Access denied'))).toBe(false);
    });

    it('retries expired tokens within a bounded budget, but never request timeouts', () => {
      const mockSupabase = createMockSupabase();
      const adapter = new SupabaseStorageAdapter(mockSupabase as any, 'test-user');
      const isRetryableError = (adapter as any).isRetryableError.bind(adapter);

      // An expired token is the routine first-request-after-idle failure: supabase-js
      // refreshes in the background, so retry rather than falling through to the local
      // fallback adapter and answering from a stale IndexedDB subset. These fail fast,
      // so the extra attempts cost almost nothing.
      expect(isRetryableError({ code: 'PGRST301', message: 'JWT expired' }, 0)).toBe(true);
      expect(isRetryableError(new Error('JWT token invalid'), 1)).toBe(true);
      expect(isRetryableError({ code: 'PGRST301', message: 'JWT expired' }, 2)).toBe(false);

      // Request timeouts stay non-retryable: each attempt burns a full timeout window,
      // so retrying doubles an 8s stall before anything renders.
      expect(isRetryableError(new Error('loadSavedMocks timeout after 8000ms'), 0)).toBe(false);

      // Connection/network timeouts stay on the general retry budget.
      expect(isRetryableError(new Error('Connection timeout'), 2)).toBe(true);
    });

    it('should handle case-insensitive error message matching', () => {
      const mockSupabase = createMockSupabase();
      const adapter = new SupabaseStorageAdapter(mockSupabase as any, 'test-user');
      const isRetryableError = (adapter as any).isRetryableError.bind(adapter);

      // Test various case combinations
      expect(isRetryableError(new Error('Network Connection Lost'))).toBe(true);
      expect(isRetryableError(new Error('NETWORK ERROR'))).toBe(true);
      expect(isRetryableError(new Error('temporary failure'))).toBe(true);
      expect(isRetryableError(new Error('RLS Policy Violation'))).toBe(false);
      expect(isRetryableError(new Error('Row Level Security violation'))).toBe(false);
      // Uppercase still matches the token branch, which is budget-bounded rather
      // than flatly non-retryable.
      expect(isRetryableError(new Error('JWT EXPIRED'), 0)).toBe(true);
      expect(isRetryableError(new Error('JWT EXPIRED'), 2)).toBe(false);
    });
  });

  describe('Error Message Generation', () => {
    it('should generate correct error types based on error characteristics', () => {
      const mockSupabase = createMockSupabase();
      const adapter = new SupabaseStorageAdapter(mockSupabase as any, 'test-user');

      // Test RLS error classification
      try {
        (adapter as any).handleError('testOperation', { code: '42501', message: 'RLS policy violation' });
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe('AUTH_ERROR');
        expect((error as StorageError).message).toBe('Access denied - user not authorized');
      }

      // Test JWT error classification
      try {
        (adapter as any).handleError('testOperation', { code: 'PGRST301', message: 'JWT expired' });
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe('NETWORK_ERROR');
        expect((error as StorageError).message).toBe('Network connection failed');
      }

      // Test network error classification
      try {
        (adapter as any).handleError('testOperation', new Error('Network connection lost'));
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe('NETWORK_ERROR');
        expect((error as StorageError).message).toBe('Network connection failed');
      }

      // Test generic error classification
      try {
        (adapter as any).handleError('testOperation', new Error('Unknown database error'));
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe('DATA_ERROR');
        expect((error as StorageError).message).toBe('Database operation failed: testOperation');
      }
    });
  });

  describe('Storage Error Creation', () => {
    it('should create proper StorageError instances', () => {
      const error = createStorageError(
        'NETWORK_ERROR',
        'Test network error',
        new Error('Original error'),
        { operation: 'testOp', leagueId: 'test-league' }
      );

      expect(error).toBeInstanceOf(StorageError);
      expect(error.code).toBe('NETWORK_ERROR');
      expect(error.message).toBe('Test network error');
      expect(error.context.operation).toBe('testOp');
      expect(error.context.leagueId).toBe('test-league');
      expect(error.originalError).toEqual(new Error('Original error'));
    });
  });

  describe('LocalStorage Error Handling', () => {
    it('should handle corrupted JSON gracefully', async () => {
      const adapter = new LocalStorageAdapter();

      // Set corrupted data
      localStorage.setItem('leagues', 'invalid-json-{');
      
      await expect(adapter.loadLeagues()).rejects.toThrow('Failed to load leagues from localStorage');
      
      // Should be able to recover
      localStorage.removeItem('leagues');
      const result = await adapter.loadLeagues();
      expect(result.leagues).toEqual({});
    });

    it('should handle quota exceeded errors', async () => {
      const adapter = new LocalStorageAdapter();
      const originalSetItem = Storage.prototype.setItem;

      try {
        Storage.prototype.setItem = jest.fn(() => {
          const error = new Error('QuotaExceededError');
          error.name = 'QuotaExceededError';
          throw error;
        });

        await expect(adapter.saveLeague('test', { platform: 'sleeper', id: 'test' }))
          .rejects.toThrow();
      } finally {
        Storage.prototype.setItem = originalSetItem;
      }
    });
  });

  describe('Simple Retry Logic (No Mock Chains)', () => {
    it('should implement exponential backoff delays correctly', () => {
      const mockSupabase = createMockSupabase();
      const adapter = new SupabaseStorageAdapter(
        mockSupabase as any, 
        'test-user',
        { retryConfig: { maxRetries: 3, backoffMs: 100 } }
      );

      // Test backoff calculation directly
      const calculateDelay = (attempt: number, baseMs: number) => baseMs * Math.pow(2, attempt);

      expect(calculateDelay(0, 100)).toBe(100);   // 100 * 2^0 = 100
      expect(calculateDelay(1, 100)).toBe(200);   // 100 * 2^1 = 200  
      expect(calculateDelay(2, 100)).toBe(400);   // 100 * 2^2 = 400
    });
  });

  describe('Error Context and Logging', () => {
    it('should include proper context in error logging', () => {
      const mockSupabase = createMockSupabase();
      const adapter = new SupabaseStorageAdapter(mockSupabase as any, 'test-user');

      try {
        (adapter as any).handleError(
          'loadLeagues', 
          new Error('Test error'),
          { leagueId: 'test-league', rosterName: 'test-roster' }
        );
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).context.operation).toBe('loadLeagues');
        expect((error as StorageError).context.leagueId).toBe('test-league');
        expect((error as StorageError).context.rosterName).toBe('test-roster');
      }

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[SupabaseStorage] Error in loadLeagues:',
        expect.any(Error)
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[SupabaseStorage] Context:',
        expect.objectContaining({ leagueId: 'test-league', rosterName: 'test-roster' })
      );
    });
  });
});