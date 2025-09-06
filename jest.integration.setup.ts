/**
 * Jest setup for integration tests
 * 
 * This setup file is specifically for integration tests that need real dependencies.
 * It includes necessary polyfills but DOES NOT mock external services like Supabase.
 */

import '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom';

// Web API polyfills for Next.js API routes
import 'whatwg-fetch'; // Provides proper fetch, Request, Response, Headers

// IndexedDB polyfill for testing Dexie (integration tests might still use Dexie as fallback)
import 'fake-indexeddb/auto';

// Mock window object for client-side checks in tests
// Note: jsdom provides localStorage, but we need to ensure it's available in our window mock
Object.defineProperty(global, 'window', {
  value: {
    location: { href: 'http://localhost' },
    document: {},
    navigator: { userAgent: 'test' },
    localStorage: global.localStorage // Use jsdom's localStorage
  },
  writable: true
});

// Polyfill for structuredClone (used by fake-indexeddb)
if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = (value: any) => {
    return JSON.parse(JSON.stringify(value));
  };
}

// Ensure all Web APIs are available
if (typeof global.Request === 'undefined') {
  global.Request = require('whatwg-fetch').Request;
}

if (typeof global.Response === 'undefined') {
  global.Response = require('whatwg-fetch').Response;
}

if (typeof global.Headers === 'undefined') {
  global.Headers = require('whatwg-fetch').Headers;
}

// Mock NextResponse to work properly in Jest environment
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((body: any, init?: any) => {
      const jsonString = JSON.stringify(body);
      const mockResponse = new Response(jsonString, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...init?.headers
        }
      });
      
      // Add json method to the response instance that properly parses JSON
      // This simulates the actual browser/Node.js Response.json() behavior
      (mockResponse as any).json = jest.fn(() => {
        return Promise.resolve(JSON.parse(jsonString));
      });
      
      return mockResponse;
    })
  }
}));

// Mock global performance API for monitoring tests
global.performance = {
  now: jest.fn(() => Date.now()),
  mark: jest.fn(),
  measure: jest.fn(),
  clearMarks: jest.fn(),
  clearMeasures: jest.fn(),
  getEntriesByName: jest.fn(),
  getEntriesByType: jest.fn(),
  getEntries: jest.fn(),
} as any;

// Mock crypto.randomUUID for consistent test IDs
global.crypto = {
  randomUUID: jest.fn(() => 'test-uuid-12345'),
} as any;

// Polyfill setImmediate for jsdom environment (used in async tests)
if (typeof global.setImmediate === 'undefined') {
  global.setImmediate = jest.fn((fn: Function) => {
    setTimeout(fn, 0);
    return {} as any;
  }) as any;
}

// NOTE: We DO NOT mock Supabase modules here - integration tests need real Supabase clients