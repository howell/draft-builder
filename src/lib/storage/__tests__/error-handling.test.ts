/**
 * Tests for error handling and retry logic across all storage adapters
 */

import { 
  createStorageError, 
  StorageError
} from '../interface';
import type { StorageErrorCode } from '../errors';
import { SupabaseStorageAdapter } from '../supabase';

describe('Storage Error Handling', () => {
  
  describe('createStorageError', () => {
    it('should create StorageError with all properties', () => {
      const originalError = new Error('Original error message');
      const context = { operation: 'test', leagueId: '12345' };
      
      const storageError = createStorageError(
        'DATA_ERROR',
        'Custom error message',
        originalError,
        context
      );

      expect(storageError).toBeInstanceOf(StorageError);
      expect(storageError.code).toBe('DATA_ERROR');
      expect(storageError.message).toBe('Custom error message');
      expect(storageError.originalError).toBe(originalError);
      expect(storageError.context).toEqual(expect.objectContaining(context));
      expect(storageError.context.timestamp).toBeInstanceOf(Date);
    });

    it('should create StorageError with minimal parameters', () => {
      const storageError = createStorageError('NETWORK_ERROR', 'Network failed');

      expect(storageError.code).toBe('NETWORK_ERROR');
      expect(storageError.message).toBe('Network failed');
      expect(storageError.originalError).toBeUndefined();
      expect(storageError.context).toBeDefined();
      expect(storageError.context.timestamp).toBeInstanceOf(Date);
    });

    it('should handle all error types', () => {
      const errorTypes: StorageErrorCode[] = ['DATA_ERROR', 'NETWORK_ERROR', 'AUTH_ERROR', 'NOT_FOUND_ERROR'];
      
      errorTypes.forEach(type => {
        const error = createStorageError(type, `Test ${type}`);
        expect(error.code).toBe(type);
        expect(error.message).toBe(`Test ${type}`);
      });
    });

    it('should preserve error stack trace', () => {
      const originalError = new Error('Original error');
      const storageError = createStorageError('DATA_ERROR', 'Storage error', originalError);

      expect(storageError.stack).toBeDefined();
      expect(storageError.stack).toContain('StorageError');
    });
  });

  describe('StorageError class', () => {
    it('should extend Error correctly', () => {
      const storageError = new StorageError('TEST_ERROR' as any, 'Test message');

      expect(storageError).toBeInstanceOf(Error);
      expect(storageError).toBeInstanceOf(StorageError);
      expect(storageError.name).toBe('StorageError');
    });

    it('should be JSON serializable', () => {
      const context = { operation: 'test', userId: '123' };
      const originalError = new Error('Original');
      const storageError = new StorageError(
        'DATA_ERROR',
        'Test error',
        originalError,
        context
      );

      const serialized = JSON.stringify(storageError);
      const parsed = JSON.parse(serialized);

      expect(parsed.code).toBe('DATA_ERROR');
      expect(parsed.message).toBe('Test error');
      expect(parsed.context).toEqual(expect.objectContaining(context));
      expect(parsed.context.timestamp).toBeDefined();
    });

    it('should handle circular references in context', () => {
      const circularContext: any = { operation: 'test' };
      circularContext.self = circularContext;

      const storageError = new StorageError('DATA_ERROR', 'Test', undefined, circularContext);

      // Should not throw when stringifying
      expect(() => JSON.stringify(storageError)).not.toThrow();
    });
  });

  describe.skip('Retry Logic Integration (covered in supabase.test.ts)', () => {
    let mockSupabase: any;
    let adapter: SupabaseStorageAdapter;
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
      mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis()
      };

      adapter = new SupabaseStorageAdapter(mockSupabase, 'test-user', {
        retryConfig: { maxRetries: 3, backoffMs: 10 }
      });

      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      jest.spyOn(console, 'error').mockImplementation();

      // Mock setTimeout to run immediately in tests
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        Promise.resolve().then(fn);
        return null as any;
      });
    });

    afterEach(() => {
      consoleWarnSpy.mockRestore();
      (global.setTimeout as jest.Mock).mockRestore();
    });

    it('should retry transient network errors', async () => {
      let attemptCount = 0;
      const networkError = new Error('Network timeout');

      mockSupabase.from.mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw networkError;
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        };
      });

      // Mock transform function
      const { transformLeaguesFromDatabase } = require('../transforms');
      jest.mocked(transformLeaguesFromDatabase).mockReturnValue({
        schemaVersion: '1.0',
        leagues: {}
      });

      const result = await adapter.loadLeagues();

      expect(attemptCount).toBe(3); // 1 initial + 2 retries
      expect(consoleWarnSpy).toHaveBeenCalledTimes(2); // 2 retry warnings
      expect(result).toBeDefined();
    });

    it('should not retry auth errors', async () => {
      const authError = { code: '42501', message: 'RLS policy violation' };
      let attemptCount = 0;

      mockSupabase.from.mockImplementation(() => {
        attemptCount++;
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: null,
              error: authError
            })
          })
        };
      });

      await expect(adapter.loadLeagues()).rejects.toThrow(/Access denied/);
      expect(attemptCount).toBe(1); // Should not retry auth errors
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should implement exponential backoff', async () => {
      const delays: number[] = [];
      let attemptCount = 0;

      // Mock setTimeout to capture delay values
      (global.setTimeout as jest.Mock).mockImplementation((fn: any, delay: number) => {
        delays.push(delay);
        setImmediate(fn);
        return null as any;
      });

      mockSupabase.from.mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 3) {
          throw new Error('Temporary failure');
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        };
      });

      const mockTransform = require('../transforms');
      mockTransform.transformLeaguesFromDatabase = jest.fn().mockReturnValue({
        schemaVersion: '1.0',
        leagues: {}
      });

      await adapter.loadLeagues();

      expect(delays).toHaveLength(3);
      expect(delays[0]).toBe(10);  // backoffMs * 2^0
      expect(delays[1]).toBe(20);  // backoffMs * 2^1
      expect(delays[2]).toBe(40);  // backoffMs * 2^2
    });

    it('should give up after max retries', async () => {
      const persistentError = new Error('Persistent failure');
      let attemptCount = 0;

      mockSupabase.from.mockImplementation(() => {
        attemptCount++;
        throw persistentError;
      });

      await expect(adapter.loadLeagues()).rejects.toThrow('Persistent failure');
      expect(attemptCount).toBe(4); // 1 initial + 3 retries
      expect(consoleWarnSpy).toHaveBeenCalledTimes(3);
    });

    it('should log retry attempts with increasing delay', async () => {
      let attemptCount = 0;

      mockSupabase.from.mockImplementation(() => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error('Retry test');
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        };
      });

      const mockTransform = require('../transforms');
      mockTransform.transformLeaguesFromDatabase = jest.fn().mockReturnValue({
        schemaVersion: '1.0',
        leagues: {}
      });

      await adapter.loadLeagues();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SupabaseStorage] Retrying loadLeagues after 10ms (attempt 1/3)')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SupabaseStorage] Retrying loadLeagues after 20ms (attempt 2/3)')
      );
    });
  });

  describe.skip('Error Classification (covered in supabase.test.ts)', () => {
    let mockSupabase: any;
    let adapter: SupabaseStorageAdapter;

    beforeEach(() => {
      mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis()
      };

      adapter = new SupabaseStorageAdapter(mockSupabase, 'test-user');
      jest.spyOn(console, 'error').mockImplementation();
    });

    const errorTestCases = [
      {
        name: 'RLS policy violations',
        supabaseError: { code: '42501', message: 'Row-level security policy violated' },
        expectedType: /Access denied/,
        shouldRetry: false
      },
      {
        name: 'RLS message detection',
        supabaseError: { message: 'RLS policy prevents access' },
        expectedType: /Access denied/,
        shouldRetry: false
      },
      {
        name: 'network timeouts',
        supabaseError: { code: 'PGRST301', message: 'Connection timeout' },
        expectedType: /Network connection failed/,
        shouldRetry: true
      },
      {
        name: 'network message detection',
        supabaseError: { message: 'network error occurred' },
        expectedType: /Network connection failed/,
        shouldRetry: true
      },
      {
        name: 'unknown database errors',
        supabaseError: { code: 'UNKNOWN_ERROR', message: 'Something went wrong' },
        expectedType: /Database operation failed/,
        shouldRetry: true
      },
      {
        name: 'constraint violations',
        supabaseError: { code: '23505', message: 'Duplicate key value' },
        expectedType: /Database operation failed/,
        shouldRetry: false
      }
    ];

    errorTestCases.forEach(({ name, supabaseError, expectedType, shouldRetry }) => {
      it(`should classify ${name} correctly`, async () => {
        mockSupabase.from.mockReturnValue({
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: null,
              error: supabaseError
            })
          })
        });

        await expect(adapter.loadLeagues()).rejects.toThrow(expectedType);
      });
    });

    it('should include operation context in errors', async () => {
      const testError = { code: 'TEST_ERROR', message: 'Test error' };
      
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: testError
              })
            })
          })
        })
      });

      try {
        await adapter.loadLeague('test-league-123');
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        const storageError = error as StorageError;
        expect(storageError.context).toEqual(
          expect.objectContaining({
            operation: 'loadLeague',
            leagueId: 'test-league-123'
          })
        );
      }
    });

    it('should preserve original error details', async () => {
      const originalError = { 
        code: 'CUSTOM_ERROR', 
        message: 'Custom error details',
        details: 'Additional error context'
      };
      
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: originalError
          })
        })
      });

      try {
        await adapter.loadLeagues();
      } catch (error) {
        expect(error).toBeInstanceOf(StorageError);
        const storageError = error as StorageError;
        expect(storageError.originalError).toEqual(originalError);
      }
    });
  });

  describe.skip('Error Recovery Scenarios (complex integration tests)', () => {
    let mockSupabase: any;
    let adapter: SupabaseStorageAdapter;

    beforeEach(() => {
      mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis()
      };

      adapter = new SupabaseStorageAdapter(mockSupabase, 'test-user', {
        retryConfig: { maxRetries: 2, backoffMs: 1 }
      });

      jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(console, 'warn').mockImplementation();
      
      // Mock setTimeout for faster tests
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        setImmediate(fn);
        return null as any;
      });
    });

    afterEach(() => {
      (global.setTimeout as jest.Mock).mockRestore();
    });

    it('should recover from intermittent database connection issues', async () => {
      let callCount = 0;
      const connectionError = { code: 'CONNECTION_ERROR', message: 'Database unavailable' };

      mockSupabase.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Connection refused');
        }
        if (callCount === 2) {
          return {
            select: jest.fn().mockReturnValue({
              eq: jest.fn().mockResolvedValue({
                data: null,
                error: connectionError
              })
            })
          };
        }
        return {
          select: jest.fn().mockReturnValue({
            eq: jest.fn().mockResolvedValue({
              data: [],
              error: null
            })
          })
        };
      });

      const mockTransform = require('../transforms');
      mockTransform.transformLeaguesFromDatabase = jest.fn().mockReturnValue({
        schemaVersion: '1.0',
        leagues: {}
      });

      const result = await adapter.loadLeagues();

      expect(callCount).toBe(3);
      expect(result).toBeDefined();
    });

    it('should handle encryption failures gracefully in ESPN auth', async () => {
      const mockDbLeague = {
        league_id: 'test-league',
        platform: 'espn',
        auth_data_encrypted: 'corrupted-base64-data'
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: mockDbLeague,
                error: null
              })
            })
          })
        })
      });

      // Mock decryption to fail
      const mockDecrypt = require('../encryption/utils');
      mockDecrypt.decryptEspnAuth = jest.fn().mockRejectedValue(new Error('Decryption failed'));

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await adapter.loadLeague('test-league');

      // Should return league without auth data instead of failing completely
      expect(result).toEqual({
        platform: 'espn',
        id: 'test-league'
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SupabaseStorage] Failed to decrypt auth data:'),
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle missing league gracefully in mock operations', async () => {
      const notFoundError = { code: 'PGRST116', message: 'No rows returned' };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            eq: jest.fn().mockReturnValue({
              single: jest.fn().mockResolvedValue({
                data: null,
                error: notFoundError
              })
            })
          })
        })
      });

      // Should return empty object instead of throwing
      const result = await adapter.loadSavedMocks('non-existent-league');
      expect(result).toEqual({});
    });

    it('should handle partial data corruption in transformations', async () => {
      const corruptedDbData = [
        { id: '1', league_id: null, platform: 'sleeper' }, // Missing league_id
        { id: '2', league_id: '12345', platform: null },   // Missing platform
        { id: '3', league_id: '67890', platform: 'espn' }  // Valid data
      ];

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: corruptedDbData,
            error: null
          })
        })
      });

      const mockTransform = require('../transforms');
      mockTransform.transformLeaguesFromDatabase = jest.fn().mockImplementation((data) => {
        // Simulate transform handling corrupted data
        const validLeagues = data.filter(league => league.league_id && league.platform);
        const leagues: any = {};
        validLeagues.forEach((league: any) => {
          leagues[league.league_id] = {
            platform: league.platform,
            id: league.league_id
          };
        });
        return { schemaVersion: '1.0', leagues };
      });

      const result = await adapter.loadLeagues();

      expect(Object.keys(result.leagues)).toHaveLength(1);
      expect(result.leagues['67890']).toEqual({
        platform: 'espn',
        id: '67890'
      });
    });
  });

  describe.skip('Performance Under Error Conditions (complex testing)', () => {
    it('should not leak memory during retry loops', async () => {
      const adapter = new SupabaseStorageAdapter({} as any, 'test-user', {
        retryConfig: { maxRetries: 100, backoffMs: 1 }
      });

      // Mock operations to always fail
      const mockOperation = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      jest.spyOn(global, 'setTimeout').mockImplementation((fn: any) => {
        setImmediate(fn);
        return null as any;
      });

      jest.spyOn(console, 'warn').mockImplementation();
      jest.spyOn(console, 'error').mockImplementation();

      // Call private withRetry method directly for testing
      const withRetryMethod = (adapter as any).withRetry.bind(adapter);

      await expect(withRetryMethod('test-operation', mockOperation)).rejects.toThrow();
      
      // Verify the operation was called the correct number of times
      expect(mockOperation).toHaveBeenCalledTimes(101); // Initial + 100 retries

      (global.setTimeout as jest.Mock).mockRestore();
    });

    it('should handle high-frequency error scenarios efficiently', async () => {
      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis()
      };

      const adapter = new SupabaseStorageAdapter(mockSupabase, 'test-user', {
        retryConfig: { maxRetries: 0, backoffMs: 1 } // No retries for speed
      });

      jest.spyOn(console, 'error').mockImplementation();

      // Simulate many rapid failures
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({
            data: null,
            error: { code: 'RAPID_FAIL', message: 'Rapid failure' }
          })
        })
      });

      const startTime = Date.now();
      const promises = Array(50).fill(0).map(() => 
        adapter.loadLeagues().catch(() => {}) // Ignore errors
      );

      await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Should complete quickly even with many failures
      expect(duration).toBeLessThan(1000); // Under 1 second for 50 operations
    });
  });
});