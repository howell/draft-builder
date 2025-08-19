import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

// Load environment variables from .env.test.local
config({ path: '.env.test.local' });

export default defineConfig({
  testDir: './e2e/tests',
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
    // Use production build to eliminate Fast Refresh while keeping test environment variables
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000, // Increased timeout for build step
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