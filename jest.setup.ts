import '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom';

// Web API polyfills for Next.js API routes
import 'whatwg-fetch'; // Provides proper fetch, Request, Response, Headers

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
const originalConsole = { ...console };
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Restore console if not explicitly mocked in test
  if (!jest.isMockFunction(console.log)) {
    console.log = originalConsole.log;
  }
  if (!jest.isMockFunction(console.warn)) {
    console.warn = originalConsole.warn;
  }
  if (!jest.isMockFunction(console.error)) {
    console.error = originalConsole.error;
  }
});