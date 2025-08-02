/**
 * Server-side rendering (SSR) specific tests for storage factory
 * Tests behavior when window is undefined (server-side environment)
 */

import { createStorageAdapter, getDefaultStorageAdapter } from '../factory';
import { MemoryStorageAdapter } from '../memory';

// Mock console.warn to prevent noise in tests
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();

describe('Storage Factory SSR', () => {
  let originalWindow: any;

  beforeAll(() => {
    // Save original window object
    originalWindow = global.window;
  });

  afterAll(() => {
    // Restore original window object
    global.window = originalWindow;
    mockConsoleWarn.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createStorageAdapter SSR behavior', () => {
    it('returns memory adapter when window is undefined', () => {
      // Simulate server-side environment
      delete (global as any).window;

      const adapter = createStorageAdapter();

      expect(adapter).toBeInstanceOf(MemoryStorageAdapter);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[Storage] localStorage not available server-side, using memory adapter'
      );
    });

    it('returns memory adapter for any config when window is undefined', () => {
      // Simulate server-side environment
      delete (global as any).window;

      const adapter = createStorageAdapter({
        type: 'localStorage'
      });

      expect(adapter).toBeInstanceOf(MemoryStorageAdapter);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[Storage] localStorage not available server-side, using memory adapter'
      );
    });

    it('returns memory adapter for supabase config when window is undefined', () => {
      // Simulate server-side environment
      delete (global as any).window;

      const mockSupabase = {
        from: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
      };

      const adapter = createStorageAdapter({
        type: 'supabase',
        supabase: mockSupabase as any,
        userId: 'test-user'
      });

      expect(adapter).toBeInstanceOf(MemoryStorageAdapter);
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[Storage] localStorage not available server-side, using memory adapter'
      );
    });
  });

  describe('getDefaultStorageAdapter SSR behavior', () => {
    it('returns memory adapter when window is undefined', () => {
      // Simulate server-side environment
      delete (global as any).window;

      const adapter = getDefaultStorageAdapter();

      expect(adapter).toBeInstanceOf(MemoryStorageAdapter);
      // No warning should be logged by getDefaultStorageAdapter directly
    });

    it('returns memory adapter in test environment', () => {
      // Restore window object
      global.window = originalWindow;
      
      // Mock NODE_ENV using Object.defineProperty
      const originalNodeEnv = process.env.NODE_ENV;
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'test',
        configurable: true
      });

      const adapter = getDefaultStorageAdapter();

      expect(adapter).toBeInstanceOf(MemoryStorageAdapter);

      // Restore NODE_ENV
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalNodeEnv,
        configurable: true
      });
    });
  });

  describe('type guards work in SSR environment', () => {
    it('isMemoryAdapter works with SSR-created adapter', () => {
      delete (global as any).window;

      const adapter = createStorageAdapter();
      const { isMemoryAdapter } = require('../factory');

      expect(isMemoryAdapter(adapter)).toBe(true);
    });
  });
});