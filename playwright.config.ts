import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';

// Load environment variables from .env.test.local
config({ path: '.env.test.local' });

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['html', { outputFolder: 'e2e/reports/html' }],
    ['junit', { outputFile: 'e2e/reports/junit/results.xml' }],
    ['json', { outputFile: 'e2e/reports/json/results.json' }],
    ...(process.env.CI ? [['github'] as const] : []),
    ...(process.env.ALLURE_RESULTS_DIR ? [['allure-playwright', { outputFolder: process.env.ALLURE_RESULTS_DIR }] as const] : [])
  ],
  
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Global timeout for each test
    actionTimeout: 30000,
    navigationTimeout: 30000
  },

  expect: {
    timeout: 10000
  },

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
    {
      name: 'webkit-desktop',
      use: { ...devices['Desktop Safari'] },
      testMatch: ['**/*.spec.ts', '!**/*mobile*.spec.ts']
    },
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
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      NODE_ENV: 'test',
      // Pass through the Next.js public variables for the app
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
      // Pass through service key for test database operations
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    }
  }
});