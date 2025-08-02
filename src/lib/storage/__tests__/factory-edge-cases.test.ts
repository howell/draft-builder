/**
 * Edge case tests for storage factory to improve test coverage
 */

import { createStorageAdapter, isLocalStorageAdapter, isSupabaseAdapter, isDexieAdapter } from '../factory';
import { LocalStorageAdapter } from '../localStorage';
import { MemoryStorageAdapter } from '../memory';
import { DexieStorageAdapter } from '../dexie';
import { SupabaseStorageAdapter } from '../supabase';

describe('Storage Factory Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Configuration validation edge cases', () => {
    it('should handle deeply nested retry config validation', () => {
      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
      };

      // Test with valid retry config with zero values (edge case)
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabase as any,
        userId: 'test-user',
        retryConfig: { maxRetries: 0, backoffMs: 0 }
      })).not.toThrow();

      // Test with undefined values in retry config
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabase as any,
        userId: 'test-user',
        retryConfig: { maxRetries: undefined as any, backoffMs: 100 }
      })).not.toThrow();

      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabase as any,
        userId: 'test-user',
        retryConfig: { maxRetries: 3, backoffMs: undefined as any }
      })).not.toThrow();
    });

    it('should handle edge cases in fallback configuration validation', () => {
      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
      };

      // Test all valid fallback types
      const validFallbacks = ['localStorage', 'dexie', 'memory'] as const;
      
      validFallbacks.forEach(fallback => {
        expect(() => createStorageAdapter({
          type: 'supabase',
          supabase: mockSupabase as any,
          userId: 'test-user',
          fallback
        })).not.toThrow();
      });

      // Test with empty string fallback (should be ignored due to falsy check)
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabase as any,
        userId: 'test-user',
        fallback: '' as any
      })).not.toThrow();

      // Test with null fallback (should be ignored due to falsy check)
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabase as any,
        userId: 'test-user',
        fallback: null as any
      })).not.toThrow();

      // Test with invalid non-falsy fallback
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabase as any,
        userId: 'test-user',
        fallback: 'invalid-type' as any
      })).toThrow('Invalid fallback adapter type: invalid-type. Supported types are: localStorage, dexie, memory');
    });

    it('should handle edge cases in userId validation for Dexie', () => {
      // Test with empty string userId
      expect(() => createStorageAdapter({
        type: 'dexie',
        userId: ''
      })).not.toThrow();

      // Test with numeric userId (should fail)
      expect(() => createStorageAdapter({
        type: 'dexie',
        userId: 123 as any
      })).toThrow('Invalid userId provided for Dexie adapter');

      // Test with object userId (should fail)
      expect(() => createStorageAdapter({
        type: 'dexie',
        userId: { id: 'test' } as any
      })).toThrow('Invalid userId provided for Dexie adapter');

      // Test with boolean userId (should fail)
      expect(() => createStorageAdapter({
        type: 'dexie',
        userId: true as any
      })).toThrow('Invalid userId provided for Dexie adapter');
    });

    it('should handle edge cases in Supabase client validation', () => {
      // Test with object that has 'from' but not a function
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: { from: 'not-a-function' } as any,
        userId: 'test-user'
      })).toThrow('Invalid Supabase client provided');

      // Test with null supabase client
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: null as any,
        userId: 'test-user'
      })).toThrow('Supabase client is required for supabase adapter');

      // Test with primitive value as supabase client
      expect(() => createStorageAdapter({
        type: 'supabase',
        supabase: 'not-an-object' as any,
        userId: 'test-user'
      })).toThrow('Invalid Supabase client provided');
    });
  });

  describe('Type guard edge cases', () => {
    it('should correctly identify localStorage adapter', () => {
      const adapter = createStorageAdapter({ type: 'localStorage' });
      expect(isLocalStorageAdapter(adapter)).toBe(true);
      expect(isSupabaseAdapter(adapter)).toBe(false);
      expect(isDexieAdapter(adapter)).toBe(false);
    });

    it('should correctly identify Dexie adapter', () => {
      const adapter = createStorageAdapter({ type: 'dexie', userId: 'test' });
      expect(isDexieAdapter(adapter)).toBe(true);
      expect(isLocalStorageAdapter(adapter)).toBe(false);
      expect(isSupabaseAdapter(adapter)).toBe(false);
    });

    it('should correctly identify Supabase adapter', () => {
      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
      };

      const adapter = createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabase as any,
        userId: 'test-user'
      });

      expect(isSupabaseAdapter(adapter)).toBe(true);
      expect(isLocalStorageAdapter(adapter)).toBe(false);
      expect(isDexieAdapter(adapter)).toBe(false);
    });

    it('should handle type guards with memory adapter', () => {
      const adapter = new MemoryStorageAdapter();
      
      expect(isLocalStorageAdapter(adapter)).toBe(false);
      expect(isSupabaseAdapter(adapter)).toBe(false);
      expect(isDexieAdapter(adapter)).toBe(false);
    });
  });

  describe('Configuration with extra properties', () => {
    it('should ignore extra properties in configuration object', () => {
      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
      };

      // Configuration with extra properties should be ignored
      const config = {
        type: 'supabase' as const,
        supabase: mockSupabase as any,
        userId: 'test-user',
        extraProperty: 'ignored',
        anotherProperty: { nested: 'object' },
        numberProperty: 42,
        booleanProperty: true
      };

      expect(() => createStorageAdapter(config as any)).not.toThrow();
      
      const adapter = createStorageAdapter(config as any);
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
    });

    it('should handle configuration with undefined optional properties', () => {
      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
      };

      const config = {
        type: 'supabase' as const,
        supabase: mockSupabase as any,
        userId: 'test-user',
        fallback: undefined,
        retryConfig: undefined,
        encryptionKey: undefined
      };

      expect(() => createStorageAdapter(config)).not.toThrow();
      
      const adapter = createStorageAdapter(config);
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
    });
  });

  describe('Factory function behavior with various inputs', () => {
    it('should handle deeply nested configuration objects', () => {
      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
      };

      const config = {
        type: 'supabase' as const,
        supabase: mockSupabase as any,
        userId: 'test-user',
        retryConfig: {
          maxRetries: 5,
          backoffMs: 1000
        },
        fallback: 'dexie' as const
      };

      const adapter = createStorageAdapter(config);
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
    });

    it('should handle configuration with all optional properties specified', () => {
      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
      };

      const config = {
        type: 'supabase' as const,
        supabase: mockSupabase as any,
        userId: 'test-user',
        fallback: 'memory' as const,
        retryConfig: {
          maxRetries: 2,
          backoffMs: 500
        },
        encryptionKey: 'test-key'
      };

      const adapter = createStorageAdapter(config);
      expect(adapter).toBeInstanceOf(SupabaseStorageAdapter);
    });
  });
});