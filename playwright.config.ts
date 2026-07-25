import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

// Load environment variables from .env.test.local
config({ path: '.env.test.local' });

// Mock static image imports for Node.js compatibility
require.extensions['.webp'] = function (module, filename) {
  module.exports = { default: filename };
};

export default defineConfig({
  testDir: './e2e/tests',
  outputDir: 'test-results',
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  globalTeardown: require.resolve('./e2e/global-teardown.ts'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 4,
  reporter: process.env.CI ? [
    ['html', { outputFolder: 'e2e/reports/html' }],
    ['junit', { outputFile: 'e2e/reports/junit/results.xml' }],
    ['json', { outputFile: 'e2e/reports/json/results.json' }],
    ['github']
  ] : [
    ['line'] // Use only line reporter for local development for speed
  ],
  
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 5000,
    navigationTimeout: 10000
  },

  expect: {
    timeout: 3000
  },

  timeout: 60_000,

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
      testMatch: ['**/*.spec.ts', '!**/*mobile*.spec.ts']
    },
    {
      name: 'firefox-desktop', 
      use: { ...devices['Desktop Firefox'] },
      testMatch: ['**/*.spec.ts', '!**/*mobile*.spec.ts']
    },
    // running into issues with network errors with webkit-desktop, so disabling for now
    // {
    //   name: 'webkit-desktop',
    //   use: { ...devices['Desktop Safari'] },
    //   testMatch: ['**/*.spec.ts', '!**/*mobile*.spec.ts']
    // },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
      testMatch: ['**/*mobile*.spec.ts']
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
      testMatch: ['**/*mobile*.spec.ts']
    }
  ],

  webServer: {
    // In CI: a production build, so the gate is not at the mercy of dev-mode cold
    // route compiles, Fast Refresh, or the Next error overlay (whose "Console Error"
    // text trips assertions that scan for /error/i). CI starts Supabase itself before
    // invoking Playwright, so this must not also run `supabase start` — `npm run dev`
    // does, and sharing the boot budget with a Docker cold start is how a 60s timeout
    // gets blown.
    //
    // Locally: unchanged (`npm run dev`), to keep hot reload while writing tests.
    command: process.env.CI
      ? 'mkdir -p test-results && npm run build && npx next start 2>&1 | tee test-results/server.log'
      : 'mkdir -p test-results && npm run dev 2>&1 | tee test-results/server.log',
    url: 'http://localhost:3000',
    // Locally, reuse a server that is already up rather than hard-failing with
    // "http://localhost:3000 is already used" — an orphaned server from a previous
    // run (this command is behind a pipe, so Playwright's kill can miss the child)
    // otherwise blocks every subsequent run until it is manually killed.
    reuseExistingServer: !process.env.CI,
    // CI has to build first; locally this only covers `next dev` starting up.
    timeout: process.env.CI ? 300 * 1000 : 120 * 1000,
    env: {
      // Set environment to test for E2E testing
      E2E_FIXTURE_MODE: 'true',
      // Pass through the Next.js public variables for the app
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      // Pass through service key for test database operations
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      // Provide encryption key for production builds
      ENCRYPTION_KEY: 'test-encryption-key-32-chars-long',
      // Provide Google API key for rankings (required by mock drafts page)
      GOOGLE_API_KEY: 'test-google-api-key-for-e2e',
      // Disable external services during testing to prevent failed requests
      NEXT_PUBLIC_VERCEL_ANALYTICS: 'false',
      DISABLE_ANALYTICS: 'true'
    }
  }
});