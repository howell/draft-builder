/**
 * Complete error recovery tests using isolated Jest configuration
 * Run with: npm run test:isolated
 */

import { SupabaseStorageAdapter } from '../supabase';
import { LocalStorageAdapter } from '../localStorage';
import { MemoryStorageAdapter } from '../memory';
import { StorageError } from '../errors';

// Mock transforms cleanly
jest.mock('../transforms', () => ({
  transformLeaguesFromDatabase: jest.fn(() => ({
    schemaVersion: '1.0',
    leagues: {}
  })),
  transformLeagueToDatabase: jest.fn(),
  transformMocksFromDatabase: jest.fn(),
  transformDraftToDatabase: jest.fn()
}));

// Mock encryption utilities
jest.mock('../../encryption/utils', () => ({
  encryptEspnAuth: jest.fn(),
  decryptEspnAuth: jest.fn()
}));

describe('Complete Error Recovery Tests (Isolated)', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    
    // Mock console methods locally
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('Network Failure Recovery', () => {
    it('should retry on transient network errors', async () => {
      const mockSupabase = {
        from: jest.fn(),
        auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })) }
      };
      
      let attemptCount = 0;
      const networkError = new Error('Network connection lost');
      
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn: Function, delay?: number) => {
        // Use process.nextTick for immediate execution without circular dependency
        process.nextTick(() => fn());
        return 1 as any; // Return a fake timeout ID
      });

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockImplementation(async () => {
            attemptCount++;
            if (attemptCount <= 2) {
              throw networkError;
            }
            return Promise.resolve({ data: [], error: null });
          })
        })
      }));

      const adapter = new SupabaseStorageAdapter(
        mockSupabase as any,
        'test-user',
        { retryConfig: { maxRetries: 3, backoffMs: 10 } }
      );

      const result = await adapter.loadLeagues();

      expect(attemptCount).toBe(4); // Initial attempt + 3 retries = 4 total attempts
      expect(result).toBeDefined();
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2); // Only 2 warnings because 3rd retry succeeds

      setTimeoutSpy.mockRestore();
    });

    it('should implement exponential backoff correctly', async () => {
      const mockSupabase = {
        from: jest.fn(),
        auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })) }
      };
      
      const backoffDelays: number[] = [];
      let attemptCount = 0;

      const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation((fn: Function, delay?: number) => {
        if (delay !== undefined) {
          backoffDelays.push(delay);
        }
        // Use process.nextTick for immediate execution without circular dependency
        process.nextTick(() => fn());
        return 1 as any; // Return a fake timeout ID
      });

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockImplementation(async () => {
            attemptCount++;
            if (attemptCount <= 3) {
              throw new Error('Temporary failure');
            }
            return Promise.resolve({ data: [], error: null });
          })
        })
      }));

      const adapter = new SupabaseStorageAdapter(
        mockSupabase as any,
        'test-user',
        { retryConfig: { maxRetries: 3, backoffMs: 10 } }
      );

      await adapter.loadLeagues();

      expect(backoffDelays).toEqual([10, 20, 40]);
      setTimeoutSpy.mockRestore();
    });

    it('should not retry on non-retryable errors', async () => {
      const mockSupabase = {
        from: jest.fn(),
        auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })) }
      };
      
      const rlsError = { code: '42501', message: 'RLS policy violation' };

      mockSupabase.from.mockImplementation(() => ({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: rlsError
          })
        })
      }));

      const adapter = new SupabaseStorageAdapter(mockSupabase as any, 'test-user');

      await expect(adapter.loadLeagues()).rejects.toThrow(/Access denied/);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Authentication and Authorization Errors', () => {
    it('should handle expired JWT tokens gracefully', async () => {
      const mockSupabase = {
        from: jest.fn(),
        auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })) }
      };
      
      const jwtError = { code: 'PGRST301', message: 'JWT expired' };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: jwtError
          })
        })
      });

      const adapter = new SupabaseStorageAdapter(mockSupabase as any, 'test-user');

      await expect(adapter.loadLeagues()).rejects.toThrow(/Network connection failed/);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SupabaseStorage] Error in loadLeagues:'),
        jwtError
      );
    });

    it('should handle RLS policy violations', async () => {
      const mockSupabase = {
        from: jest.fn(),
        auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })) }
      };
      
      const rlsError = { code: '42501', message: 'Row-level security policy violated' };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: rlsError
          })
        })
      });

      const adapter = new SupabaseStorageAdapter(mockSupabase as any, 'unauthorized-user');

      await expect(adapter.loadLeagues()).rejects.toThrow(/Access denied/);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Data Corruption and Storage Errors', () => {
    it('should handle corrupted localStorage data gracefully', async () => {
      const adapter = new LocalStorageAdapter();
      
      localStorage.setItem('leagues', 'invalid-json-{');
      
      await expect(adapter.loadLeagues()).rejects.toThrow('Failed to load leagues from localStorage');
      
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

        expect(consoleErrorSpy).toHaveBeenCalled();
      } finally {
        Storage.prototype.setItem = originalSetItem;
      }
    });

    it('should handle memory pressure gracefully', async () => {
      const adapter = new MemoryStorageAdapter();
      
      // Create many adapters and large datasets
      const adapters: MemoryStorageAdapter[] = [];
      
      for (let i = 0; i < 50; i++) {
        const newAdapter = new MemoryStorageAdapter();
        adapters.push(newAdapter);
        
        await newAdapter.saveLeague(`memory-pressure-${i}`, {
          platform: 'sleeper',
          id: `memory-pressure-${i}`
        });
      }
      
      expect(adapters).toHaveLength(50);
      
      // Should handle large number of adapters without crashing
      const result = await adapters[0].loadLeagues();
      expect(result).toBeDefined();
    });
  });

  describe('Error Classification Logic', () => {
    it('should correctly classify error types', () => {
      const mockSupabase = {
        from: jest.fn(),
        auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })) }
      };
      
      const adapter = new SupabaseStorageAdapter(mockSupabase as any, 'test-user');
      const isRetryableError = (adapter as any).isRetryableError.bind(adapter);

      // Retryable errors
      expect(isRetryableError(new Error('Network connection lost'))).toBe(true);
      expect(isRetryableError(new Error('Temporary failure'))).toBe(true);
      expect(isRetryableError(new Error('NETWORK ERROR'))).toBe(true);

      // Non-retryable errors
      expect(isRetryableError({ code: '42501', message: 'RLS violation' })).toBe(false);
      expect(isRetryableError({ code: 'PGRST301', message: 'JWT expired' })).toBe(false);
      expect(isRetryableError(new Error('RLS policy violated'))).toBe(false);
      expect(isRetryableError(new Error('Authorization failed'))).toBe(false);
    });

    it('should generate appropriate error messages', () => {
      const mockSupabase = {
        from: jest.fn(),
        auth: { getSession: jest.fn(() => Promise.resolve({ data: { session: null }, error: null })) }
      };
      
      const adapter = new SupabaseStorageAdapter(mockSupabase as any, 'test-user');

      // Test RLS error
      try {
        (adapter as any).handleError('testOp', { code: '42501', message: 'RLS violation' });
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe('AUTH_ERROR');
        expect((error as StorageError).message).toBe('Access denied - user not authorized');
      }

      // Test JWT error
      try {
        (adapter as any).handleError('testOp', { code: 'PGRST301', message: 'JWT expired' });
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        expect((error as StorageError).code).toBe('NETWORK_ERROR');
        expect((error as StorageError).message).toBe('Network connection failed');
      }
    });
  });
});