import '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom';

// Web API polyfills for Next.js API routes
import 'whatwg-fetch'; // Provides proper fetch, Request, Response, Headers

// IndexedDB polyfill for testing Dexie
import 'fake-indexeddb/auto';

// Mock window object for client-side checks in tests
// Note: jsdom provides localStorage, but we need to ensure it's available in our window mock
//
// `document` MUST stay the real jsdom document. Under testEnvironment: "jsdom",
// `global` IS the window, so this replaces the window property wholesale. With
// `document: {}`, `typeof window.document.createElement` is 'undefined', which makes
// React's canUseDOM false (react-dom-client.development.js:25141-25145). That
// silently disables the ChangeEventPlugin's modern path, so onChange never fires for
// text inputs, and it breaks @testing-library's getDocument(), so a bare waitFor()
// throws. Both symptoms were long mistaken for "setState doesn't re-render under
// jest" — it does; see src/ui/tests/LoadingScreen.test.tsx.
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