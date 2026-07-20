/**
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

import type {Config} from 'jest';
import nextJest from 'next/jest.js'
const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

const config: Config = {
  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,


  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",

  // Indicates which provider should be used to instrument code for coverage
  coverageProvider: "v8",

  // Transform ES modules from node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(@supabase|@babel|@jest))'
  ],

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // The test environment that will be used for testing
  testEnvironment: "jsdom",

  // Ignore test utility files, integration tests, Playwright e2e tests, and
  // git worktrees under .claude/ (their tests run from within the worktree)
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/src/.*/__tests__/test-utils/',
    '<rootDir>/src/.*\\.integration\\.test\\.(ts|tsx)$',
    '<rootDir>/e2e/',
    '<rootDir>/.claude/'
  ],

  // Module name mapping for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

export default createJestConfig(config);
