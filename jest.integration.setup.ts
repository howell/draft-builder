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
//
// `document` MUST stay the real jsdom document — see the matching note in
// jest.setup.ts. A `{}` stub makes React's canUseDOM false, which disables
// onChange for text inputs and breaks @testing-library's bare waitFor().
Object.defineProperty(global, 'window', {
  value: {
    location: { href: 'http://localhost' },
    document: global.document,
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

// Fail loudly when the local Supabase env is missing.
//
// Each integration file computes its own SUPABASE_AVAILABLE gate and, when it is
// false, console.warns and no-ops — so the suite reports "passed" having asserted
// nothing. That has silently hidden these tests at least twice (see the comments in
// supabase.integration.test.ts about the .env.test.local load and the
// localhost/127.0.0.1 hostname mismatch), and a green run that tested nothing is
// worse than a red one.
//
// `npm run test:integration` is an explicit request to run against a real database,
// so treat missing env as an error. Set SKIP_INTEGRATION_TESTS=1 to opt out
// deliberately.
if (!process.env.SKIP_INTEGRATION_TESTS) {
  // The integration jest config does not auto-load env files, so each test file has
  // been doing this itself at module scope. Load here too — this runs first, and the
  // per-file calls are then no-ops (dotenv does not override already-set vars).
  const { config: loadEnv } = require('dotenv');
  loadEnv({ path: '.env.test.local' });
  loadEnv({ path: '.env.local' });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const localUrl = url?.includes('localhost:54321') || url?.includes('127.0.0.1:54321');

  if (!localUrl || !serviceKey) {
    throw new Error(
      [
        'Integration tests require a local Supabase instance.',
        `  NEXT_PUBLIC_SUPABASE_URL: ${url ?? '(unset)'}${url && !localUrl ? ' (not localhost:54321)' : ''}`,
        `  SUPABASE_SERVICE_ROLE_KEY: ${serviceKey ? 'set' : '(unset)'}`,
        '',
        'Start it with `npm run dev:db`, and make sure .env.test.local is present',
        '(git worktrees do not inherit it from the main checkout).',
        'To skip these tests deliberately, set SKIP_INTEGRATION_TESTS=1.',
      ].join('\n')
    );
  }
}