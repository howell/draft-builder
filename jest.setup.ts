import '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom';

// Web API polyfills for Next.js API routes
import 'whatwg-fetch'; // Provides proper fetch, Request, Response, Headers

// IndexedDB polyfill for testing Dexie
import 'fake-indexeddb/auto';

// NOTE: do not replace `global.window` with a hand-rolled stub.
//
// Under testEnvironment: "jsdom", `global` IS the window, so assigning to it swaps the
// real window for whatever the stub defines — and anything absent from the stub simply
// breaks. This setup used to install a four-key object, which caused two long-lived
// and badly misdiagnosed failures:
//
//   - `document: {}` left `typeof window.document.createElement === 'undefined'`, so
//     React's canUseDOM was false (react-dom-client.development.js:25141-25145). That
//     disables the ChangeEventPlugin's modern path, so onChange never fired for text
//     inputs, and it broke @testing-library's getDocument(), so bare waitFor() threw.
//   - no `addEventListener`, so any component subscribing to window events threw on
//     mount (e.g. MockRosterEntry), making the whole tree unrenderable.
//
// These were recorded in comments across the suite as "React state updates don't
// re-render under jest", and stateful component coverage was given up and pushed to
// Playwright as a result. Re-renders were never broken.
//
// jsdom already provides window.location, window.document, window.navigator and
// window.localStorage, so the stub was redundant even before it was harmful. Tests
// that need an SSR-like environment (e.g. storage factory tests) delete and restore
// `global.window` themselves.

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

// Mock fetch for webhook tests
global.fetch = jest.fn();

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

// Mock Supabase modules to avoid ES module issues
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(),
    auth: { getSession: jest.fn() },
    storage: {}
  }))
}));

jest.mock('@supabase/ssr', () => ({
  createBrowserClient: jest.fn(),
  createServerClient: jest.fn()
}));

// Suppress console logs in tests unless explicitly testing them
// const originalConsole = { ...console };
// beforeEach(() => {
//   jest.spyOn(console, 'log').mockImplementation(() => {});
//   jest.spyOn(console, 'warn').mockImplementation(() => {});
//   jest.spyOn(console, 'error').mockImplementation(() => {});
// });

// afterEach(() => {
//   // Restore console if not explicitly mocked in test
//   if (!jest.isMockFunction(console.log)) {
//     console.log = originalConsole.log;
//   }
//   if (!jest.isMockFunction(console.warn)) {
//     console.warn = originalConsole.warn;
//   }
//   if (!jest.isMockFunction(console.error)) {
//     console.error = originalConsole.error;
//   }
// });