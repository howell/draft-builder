/**
 * Test utilities for monitoring system tests
 * Reduces repetition and provides consistent mocking patterns
 */

/**
 * Creates a Supabase query mock that properly implements the Promise interface
 */
export function createQueryMock<T = any>(resolveValue: T): any {
  const promise = Promise.resolve(resolveValue);
  
  return {
    // Query builder methods that return the mock itself for chaining
    select: jest.fn().mockReturnValue(promise),
    insert: jest.fn().mockReturnValue(promise),
    update: jest.fn().mockReturnValue(promise),
    delete: jest.fn().mockReturnValue(promise),
    upsert: jest.fn().mockReturnValue(promise),
    eq: jest.fn().mockReturnValue(promise),
    limit: jest.fn().mockReturnValue(promise),
    
    // Promise interface - bind to the actual promise
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
    finally: promise.finally.bind(promise)
  };
}

/**
 * Creates a Supabase query mock that rejects with an error
 */
export function createQueryMockRejection(error: any): any {
  const promise = Promise.reject(error);
  
  return {
    select: jest.fn().mockReturnValue(promise),
    insert: jest.fn().mockReturnValue(promise),
    update: jest.fn().mockReturnValue(promise),
    delete: jest.fn().mockReturnValue(promise),
    upsert: jest.fn().mockReturnValue(promise),
    eq: jest.fn().mockReturnValue(promise),
    limit: jest.fn().mockReturnValue(promise)
  };
}

/**
 * Creates a mock Supabase client with standard structure
 */
export function createMockSupabaseClient() {
  return {
    from: jest.fn(),
    auth: {
      getSession: jest.fn(),
      mock: 'auth'
    },
    storage: { mock: 'storage' }
  };
}

/**
 * Utility for mocking performance.now() to simulate operation duration
 */
export class PerformanceMockHelper {
  private spy: jest.SpyInstance | null = null;
  
  /**
   * Mock performance.now() to simulate a specific duration
   */
  mockDuration(durationMs: number): void {
    this.spy = jest.spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(durationMs);
  }
  
  /**
   * Mock performance.now() to return a fixed value
   */
  mockFixed(value: number): void {
    this.spy = jest.spyOn(performance, 'now').mockReturnValue(value);
  }
  
  /**
   * Restore the performance.now() mock
   */
  restore(): void {
    if (this.spy) {
      this.spy.mockRestore();
      this.spy = null;
    }
  }
}

/**
 * Utility for managing console spies consistently
 */
export class ConsoleMockHelper {
  private spies: jest.SpyInstance[] = [];
  
  /**
   * Spy on console.log and suppress output
   */
  spyOnLog(): jest.SpyInstance {
    const spy = jest.spyOn(console, 'log').mockImplementation();
    this.spies.push(spy);
    return spy;
  }
  
  /**
   * Spy on console.warn and suppress output
   */
  spyOnWarn(): jest.SpyInstance {
    const spy = jest.spyOn(console, 'warn').mockImplementation();
    this.spies.push(spy);
    return spy;
  }
  
  /**
   * Spy on console.error and suppress output
   */
  spyOnError(): jest.SpyInstance {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    this.spies.push(spy);
    return spy;
  }
  
  /**
   * Restore all console spies
   */
  restoreAll(): void {
    this.spies.forEach(spy => spy.mockRestore());
    this.spies = [];
  }
}

/**
 * Creates standard health check responses for testing
 */
export function createHealthCheckResponse(overrides: any = {}) {
  return {
    overall: 'healthy',
    checks: {
      database: { status: 'healthy' },
      authentication: { status: 'healthy' },
      rls: { status: 'healthy' },
      criticalPaths: { status: 'healthy' }
    },
    timestamp: new Date(),
    ...overrides
  };
}

/**
 * Creates degraded health check responses with specific failures
 */
export function createDegradedHealthResponse(failedChecks: string[] = []) {
  const checks: any = {
    database: { status: 'healthy' },
    authentication: { status: 'healthy' },
    rls: { status: 'healthy' },
    criticalPaths: { status: 'healthy' }
  };
  
  failedChecks.forEach(check => {
    if (checks[check]) {
      checks[check].status = 'degraded';
    }
  });
  
  return {
    overall: 'degraded',
    checks,
    timestamp: new Date()
  };
}

/**
 * Timer management utility for fake timers
 */
export class TimerMockHelper {
  /**
   * Setup fake timers - call in beforeEach
   */
  static setup(): void {
    jest.useFakeTimers();
  }
  
  /**
   * Cleanup fake timers - call in afterEach
   */
  static cleanup(): void {
    jest.useRealTimers();
  }
  
  /**
   * Advance timers by specified amount
   */
  static advance(ms: number): void {
    jest.advanceTimersByTime(ms);
  }
  
  /**
   * Run only pending timers asynchronously
   */
  static async runPendingAsync(): Promise<void> {
    await jest.runOnlyPendingTimersAsync();
  }
}

/**
 * Standard test setup utility that handles common mock clearing
 */
export function setupTestMocks(): void {
  jest.clearAllMocks();
}

/**
 * Standard test cleanup utility
 */
export function cleanupTestMocks(): void {
  jest.restoreAllMocks();
}

/**
 * Creates a mock fetch response for webhook testing
 */
export function mockFetchSuccess(): void {
  (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
    ok: true,
    status: 200
  });
}

/**
 * Creates a mock fetch failure for webhook testing
 */
export function mockFetchFailure(error: Error = new Error('Webhook endpoint down')): void {
  (global.fetch as jest.Mock) = jest.fn().mockRejectedValue(error);
}