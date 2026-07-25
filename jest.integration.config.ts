/**
 * Jest configuration for integration tests
 * 
 * This configuration is specifically for integration tests that need real dependencies
 * (like Supabase) rather than mocked ones. It uses a separate setup file that
 * doesn't mock external services.
 * 
 * Run with: npm run test:integration
 */

import type {Config} from 'jest';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Locate an installed package directory by walking up from this config file.
 *
 * These mappings point at CJS builds, which are deep subpaths that the packages'
 * `exports` fields do not expose — so `require.resolve` cannot be used. The previous
 * literal `<rootDir>/node_modules/...` form broke in git worktrees, which have no
 * node_modules of their own and resolve upward to the main checkout; the whole
 * integration suite failed to start there with "Could not locate module ... mapped
 * as". Walking up mirrors Node's own resolution without consulting `exports`.
 */
function packageDir(name: string): string {
  let dir = __dirname;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`[jest.integration.config] Cannot find ${name}. Run npm install.`);
    }
    dir = parent;
  }
}

const config: Config = {
  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: false, // Disable coverage for integration tests to improve performance

  // Use ts-jest for TypeScript support
  preset: 'ts-jest',
  
  // Transform configuration with modern ts-jest config
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: './tsconfig.json'
    }],
    '^.+\\.(js|jsx|mjs)$': 'babel-jest',
  },

  // Transform ES modules from node_modules - allow @supabase packages and other ES modules to be transformed
  transformIgnorePatterns: [
    'node_modules/(?!(@supabase|.*\\.mjs))'
  ],

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  setupFilesAfterEnv: ['<rootDir>/jest.integration.setup.ts'],

  // The test environment that will be used for testing
  testEnvironment: "jsdom",

  // Only run integration test files
  testMatch: [
    '<rootDir>/src/**/*.integration.test.ts',
    '<rootDir>/src/**/*.integration.test.tsx'
  ],

  // Module name mapping for path aliases and forcing CommonJS versions of problematic packages
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // See packageDir above for why these are resolved rather than hardcoded.
    '^@supabase/supabase-js$': path.join(packageDir('@supabase/supabase-js'), 'dist/main/index.js'),
    '^@supabase/realtime-js$': path.join(packageDir('@supabase/realtime-js'), 'dist/main/index.js'),
  },

  // Longer timeout for integration tests
  testTimeout: 30000,
};

export default config;