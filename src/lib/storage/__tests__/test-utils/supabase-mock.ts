/**
 * Comprehensive Supabase client mock utilities for testing
 * 
 * This provides a realistic mock of the Supabase client that properly handles
 * the fluent API pattern and can be configured for various test scenarios.
 */

import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Configuration for mock query results
 */
export interface MockQueryConfig {
  data?: any;
  error?: any;
  count?: number;
}

/**
 * Scenarios for testing different Supabase states
 */
export type MockScenario = 
  | 'success'
  | 'network_error' 
  | 'auth_error'
  | 'not_found'
  | 'server_error'
  | 'timeout';

/**
 * Mock query builder that properly implements the fluent API
 */
export class MockQueryBuilder {
  private config: MockQueryConfig = {};
  
  constructor(initialConfig: MockQueryConfig = {}) {
    this.config = { ...initialConfig };
  }

  // Fluent API methods that return this for chaining
  select(columns?: string) { return this; }
  eq(column: string, value: any) { return this; }
  neq(column: string, value: any) { return this; }
  gt(column: string, value: any) { return this; }
  gte(column: string, value: any) { return this; }
  lt(column: string, value: any) { return this; }
  lte(column: string, value: any) { return this; }
  like(column: string, value: any) { return this; }
  ilike(column: string, value: any) { return this; }
  in(column: string, values: any[]) { return this; }
  contains(column: string, value: any) { return this; }
  order(column: string, options?: any) { return this; }
  limit(count: number) { return this; }
  offset(count: number) { return this; }

  // Terminal methods that return promises
  async single() {
    if (this.config.error) {
      throw this.config.error;
    }
    return { data: this.config.data, error: null };
  }

  async maybeSingle() {
    if (this.config.error) {
      throw this.config.error;
    }
    return { data: this.config.data || null, error: null };
  }

  async then(resolve: any, reject?: any) {
    try {
      if (this.config.error) {
        return reject ? reject(this.config.error) : Promise.reject(this.config.error);
      }
      const result = { data: this.config.data, error: null, count: this.config.count };
      return resolve(result);
    } catch (error) {
      return reject ? reject(error) : Promise.reject(error);
    }
  }

  // Update configuration for different scenarios
  setConfig(config: MockQueryConfig) {
    this.config = { ...this.config, ...config };
    return this;
  }
}

/**
 * Mock table interface
 */
export class MockTable {
  private queryConfig: MockQueryConfig = {};

  constructor(private tableName: string) {}

  select(columns?: string) {
    return new MockQueryBuilder(this.queryConfig);
  }

  insert(values: any) {
    return new MockQueryBuilder(this.queryConfig);
  }

  upsert(values: any, options?: any) {
    return new MockQueryBuilder(this.queryConfig);
  }

  update(values: any) {
    return new MockQueryBuilder(this.queryConfig);
  }

  delete() {
    return new MockQueryBuilder(this.queryConfig);
  }

  // Configure this table's mock behavior
  setMockConfig(config: MockQueryConfig) {
    this.queryConfig = config;
    return this;
  }
}

/**
 * Comprehensive Supabase client mock
 */
export class MockSupabaseClient {
  private tables = new Map<string, MockTable>();
  private globalConfig: MockQueryConfig = {};

  from(tableName: string): MockTable {
    if (!this.tables.has(tableName)) {
      this.tables.set(tableName, new MockTable(tableName));
    }
    
    const table = this.tables.get(tableName)!;
    // Apply global config to table
    table.setMockConfig({ ...this.globalConfig });
    return table;
  }

  // Configure mock behavior globally
  setGlobalMockConfig(config: MockQueryConfig) {
    this.globalConfig = config;
    return this;
  }

  // Configure specific table behavior
  setTableMockConfig(tableName: string, config: MockQueryConfig) {
    const table = this.from(tableName);
    table.setMockConfig(config);
    return this;
  }

  // Configure for common scenarios
  setScenario(scenario: MockScenario) {
    switch (scenario) {
      case 'success':
        this.setGlobalMockConfig({ data: [], error: null });
        break;
      case 'network_error':
        this.setGlobalMockConfig({ 
          error: new Error('Network error'), 
          data: null 
        });
        break;
      case 'auth_error':
        this.setGlobalMockConfig({ 
          error: { code: '42501', message: 'RLS policy violation' }, 
          data: null 
        });
        break;
      case 'not_found':
        this.setGlobalMockConfig({ 
          error: { code: 'PGRST116', message: 'No rows returned' }, 
          data: null 
        });
        break;
      case 'server_error':
        this.setGlobalMockConfig({ 
          error: { code: '500', message: 'Internal server error' }, 
          data: null 
        });
        break;
      case 'timeout':
        this.setGlobalMockConfig({ 
          error: new Error('Request timeout'), 
          data: null 
        });
        break;
    }
    return this;
  }

  // Reset all mock configurations
  reset() {
    this.tables.clear();
    this.globalConfig = {};
    return this;
  }
}

/**
 * Factory function to create a mock Supabase client
 */
export function createMockSupabaseClient(): MockSupabaseClient {
  return new MockSupabaseClient();
}

/**
 * Create a fully typed mock using jest-mock-extended (for complex scenarios)
 */
export function createDeepMockSupabaseClient(): DeepMockProxy<SupabaseClient<Database>> {
  return mockDeep<SupabaseClient<Database>>();
}

/**
 * Reset all mocks (useful in beforeEach)
 */
export function resetAllMocks() {
  mockReset;
}

/**
 * Common error objects for testing
 */
export const MOCK_ERRORS = {
  NETWORK: new Error('Network unavailable'),
  AUTH: { code: '42501', message: 'RLS policy violation' },
  NOT_FOUND: { code: 'PGRST116', message: 'No rows returned' },
  SERVER: { code: '500', message: 'Internal server error' },
  TIMEOUT: new Error('Request timeout')
} as const;