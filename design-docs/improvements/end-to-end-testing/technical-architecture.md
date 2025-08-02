# Technical Architecture for E2E Testing

## Framework Comparison and Selection

### Playwright vs Cypress: Detailed Analysis

| Aspect | Playwright | Cypress | Decision Rationale |
|--------|------------|---------|-------------------|
| **Browser Support** | Chrome, Firefox, Safari | Chrome, Edge, Firefox (limited Safari) | ✅ **Playwright**: Better cross-browser coverage for fantasy sports users |
| **Language Support** | JS, TS, Python, C#, Java | JS, TS only | ✅ **Playwright**: Better language flexibility |
| **Parallel Execution** | Native support | Requires paid plan | ✅ **Playwright**: Essential for CI/CD performance |
| **API Testing** | Built-in support | Limited | ✅ **Playwright**: Critical for ESPN/Sleeper integration |
| **Mobile Testing** | Excellent emulation | Limited | ✅ **Playwright**: Important for responsive design |
| **Learning Curve** | Moderate | Easier | ⚠️ **Cypress**: Slight advantage in ease of use |
| **Debugging** | Good (Inspector, traces) | Excellent (time-travel) | ⚠️ **Cypress**: Superior debugging experience |
| **Community** | Growing rapidly | Mature | ⚠️ **Cypress**: More established ecosystem |

### Final Decision: Playwright

**Primary Reasons:**
1. **Cross-browser reliability** for diverse user base
2. **Parallel execution** for fast CI/CD pipelines
3. **API testing capabilities** for external service integration
4. **Mobile browser emulation** for responsive testing
5. **TypeScript-first approach** matching application stack

## Architecture Design

### Project Structure

```
e2e/
├── tests/
│   ├── auth/
│   │   ├── login.spec.ts
│   │   ├── signup.spec.ts
│   │   └── session-management.spec.ts
│   ├── platform-integration/
│   │   ├── espn-connection.spec.ts
│   │   ├── sleeper-connection.spec.ts
│   │   └── api-error-handling.spec.ts
│   ├── mock-drafts/
│   │   ├── draft-creation.spec.ts
│   │   ├── player-selection.spec.ts
│   │   ├── budget-management.spec.ts
│   │   └── draft-persistence.spec.ts
│   ├── analytics/
│   │   ├── historical-analysis.spec.ts
│   │   ├── chart-rendering.spec.ts
│   │   └── data-export.spec.ts
│   └── cross-browser/
│       ├── responsive-design.spec.ts
│       └── browser-compatibility.spec.ts
├── fixtures/
│   ├── test-data/
│   │   ├── leagues.json
│   │   ├── players.json
│   │   └── draft-history.json
│   └── api-mocks/
│       ├── espn-responses.json
│       └── sleeper-responses.json
├── page-objects/
│   ├── base-page.ts
│   ├── auth-page.ts
│   ├── home-page.ts
│   ├── league-dashboard.ts
│   ├── mock-draft-page.ts
│   └── analytics-page.ts
├── utils/
│   ├── database-helpers.ts
│   ├── api-mocks.ts
│   ├── test-data-factory.ts
│   └── auth-helpers.ts
├── config/
│   ├── playwright.config.ts
│   ├── test-environments.ts
│   └── browser-configs.ts
└── reports/
    ├── html/
    ├── junit/
    └── traces/
```

### Configuration Strategy

#### Playwright Configuration (`playwright.config.ts`)

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['html'],
    ['junit', { outputFile: 'reports/junit/results.xml' }],
    ['allure-playwright']
  ],
  
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },

  projects: [
    // Desktop browsers
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    },
    
    // Mobile browsers
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] }
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] }
    }
  ],

  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000
    }
  ]
});
```

#### Environment Configuration

```typescript
// config/test-environments.ts
export interface TestEnvironment {
  name: string;
  baseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  databaseUrl: string;
  apiMockServer?: string;
}

export const environments: Record<string, TestEnvironment> = {
  local: {
    name: 'Local Development',
    baseUrl: 'http://localhost:3000',
    supabaseUrl: 'http://localhost:54321',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY_LOCAL!,
    databaseUrl: 'postgresql://postgres:postgres@localhost:54322/postgres'
  },
  ci: {
    name: 'CI Environment',
    baseUrl: 'http://localhost:3000',
    supabaseUrl: 'http://localhost:54321',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY_CI!,
    databaseUrl: process.env.DATABASE_URL_CI!
  },
  staging: {
    name: 'Staging Environment',
    baseUrl: process.env.STAGING_URL!,
    supabaseUrl: process.env.SUPABASE_URL_STAGING!,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY_STAGING!,
    databaseUrl: process.env.DATABASE_URL_STAGING!,
    apiMockServer: process.env.API_MOCK_SERVER_STAGING
  }
};
```

## Page Object Model Implementation

### Base Page Class

```typescript
// page-objects/base-page.ts
import { Page, Locator, expect } from '@playwright/test';

export abstract class BasePage {
  readonly page: Page;
  
  constructor(page: Page) {
    this.page = page;
  }

  async waitForLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  async takeScreenshot(name: string) {
    await this.page.screenshot({ 
      path: `screenshots/${name}.png`,
      fullPage: true 
    });
  }

  protected async waitForSelector(selector: string, timeout = 30000) {
    return this.page.waitForSelector(selector, { timeout });
  }

  protected async clickWithRetry(selector: string, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.page.click(selector);
        return;
      } catch (error) {
        if (i === maxRetries - 1) throw error;
        await this.page.waitForTimeout(1000);
      }
    }
  }
}
```

### Specialized Page Objects

```typescript
// page-objects/auth-page.ts
import { Page, expect } from '@playwright/test';
import { BasePage } from './base-page';

export class AuthPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly signupButton: Locator;
  readonly errorMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('[data-testid="email-input"]');
    this.passwordInput = page.locator('[data-testid="password-input"]');
    this.loginButton = page.locator('[data-testid="login-button"]');
    this.signupButton = page.locator('[data-testid="signup-button"]');
    this.errorMessage = page.locator('[data-testid="auth-error"]');
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await this.waitForLoad();
  }

  async expectLoginSuccess() {
    await expect(this.page).toHaveURL(/\/league/);
  }

  async expectLoginError(message?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }
}
```

## Database Testing Strategy

### Supawright Integration

```typescript
// utils/database-helpers.ts
import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/database.types';

export class DatabaseHelpers {
  private supabase;

  constructor() {
    this.supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  async seedTestUser(userData: Partial<User> = {}) {
    const defaultUser = {
      email: `test-${Date.now()}@example.com`,
      password: 'TestPassword123!'
    };

    const user = { ...defaultUser, ...userData };
    
    const { data, error } = await this.supabase.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true
    });

    if (error) throw error;
    return data.user;
  }

  async seedTestLeague(userId: string, leagueData: Partial<League> = {}) {
    const defaultLeague = {
      user_id: userId,
      league_id: `test-league-${Date.now()}`,
      platform: 'sleeper' as const,
      auth_data_encrypted: null
    };

    const league = { ...defaultLeague, ...leagueData };

    const { data, error } = await this.supabase
      .from('leagues')
      .insert(league)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async cleanupTestData(userId: string) {
    // Cleanup in dependency order
    await this.supabase.from('player_selections').delete().match({ 
      draft_session_id: { in: await this.getUserDraftSessions(userId) }
    });
    
    await this.supabase.from('draft_sessions').delete().match({ user_id: userId });
    await this.supabase.from('leagues').delete().match({ user_id: userId });
    await this.supabase.auth.admin.deleteUser(userId);
  }

  private async getUserDraftSessions(userId: string) {
    const { data } = await this.supabase
      .from('draft_sessions')
      .select('id')
      .eq('user_id', userId);
    
    return data?.map(session => session.id) || [];
  }
}
```

## API Mocking Strategy

### MSW Integration

```typescript
// utils/api-mocks.ts
import { rest } from 'msw';
import { setupServer } from 'msw/node';

export const mockHandlers = [
  // ESPN API mocks
  rest.get('https://fantasy.espn.com/apis/v3/games/ffl/seasons/:year/segments/0/leagues/:leagueId', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        id: 123456,
        settings: {
          name: 'Test League',
          size: 12,
          scoringSettings: { /* ... */ }
        }
      })
    );
  }),

  // Sleeper API mocks
  rest.get('https://api.sleeper.app/v1/league/:leagueId', (req, res, ctx) => {
    return res(
      ctx.status(200),
      ctx.json({
        league_id: req.params.leagueId,
        name: 'Test Sleeper League',
        total_rosters: 12
      })
    );
  }),

  // Error scenarios
  rest.get('https://fantasy.espn.com/apis/v3/games/ffl/seasons/:year/segments/0/leagues/invalid', (req, res, ctx) => {
    return res(ctx.status(404));
  })
];

export const server = setupServer(...mockHandlers);

// Test setup
export function setupMockServer() {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}
```

## Performance Optimization

### Parallel Execution Strategy

```typescript
// tests/parallel-execution.spec.ts
import { test } from '@playwright/test';

test.describe.configure({ mode: 'parallel' });

test.describe('League Operations', () => {
  test('ESPN league connection', async ({ page }) => {
    // Test implementation
  });

  test('Sleeper league connection', async ({ page }) => {
    // Test implementation
  });

  test('League data validation', async ({ page }) => {
    // Test implementation
  });
});
```

### Resource Management

```typescript
// utils/resource-manager.ts
export class ResourceManager {
  private static activeConnections = new Set<string>();

  static async acquireDatabase(testName: string): Promise<string> {
    const dbName = `test_db_${testName}_${Date.now()}`;
    this.activeConnections.add(dbName);
    
    // Create isolated test database
    await this.createTestDatabase(dbName);
    return dbName;
  }

  static async releaseDatabase(dbName: string) {
    if (this.activeConnections.has(dbName)) {
      await this.dropTestDatabase(dbName);
      this.activeConnections.delete(dbName);
    }
  }

  private static async createTestDatabase(name: string) {
    // Implementation for creating isolated test database
  }

  private static async dropTestDatabase(name: string) {
    // Implementation for cleanup  
  }
}
```

## Error Handling and Resilience

### Retry Mechanisms

```typescript
// utils/retry-helpers.ts
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      
      console.log(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      delayMs *= 2; // Exponential backoff
    }
  }
  
  throw new Error('Max retries exceeded');
}
```

### Flaky Test Detection

```typescript
// utils/flaky-test-detector.ts
export class FlakyTestDetector {
  private static failures = new Map<string, number>();
  
  static recordFailure(testName: string) {
    const count = this.failures.get(testName) || 0;
    this.failures.set(testName, count + 1);
    
    if (count > 3) {
      console.warn(`⚠️  Test "${testName}" has failed ${count + 1} times. Consider reviewing for flakiness.`);
    }
  }
  
  static getFlakiestTests(limit: number = 10) {
    return Array.from(this.failures.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit);
  }
}
```

## Testing Utilities

### Test Data Factory

```typescript
// utils/test-data-factory.ts
export class TestDataFactory {
  static createUser(overrides: Partial<User> = {}): User {
    return {
      id: `user_${Date.now()}`,
      email: `test.user.${Date.now()}@example.com`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    };
  }

  static createLeague(overrides: Partial<League> = {}): League {
    return {
      id: `league_${Date.now()}`,
      user_id: 'user_123',
      league_id: `${Math.floor(Math.random() * 1000000)}`,
      platform: 'sleeper',
      auth_data_encrypted: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    };
  }

  static createMockDraft(overrides: Partial<DraftSession> = {}): DraftSession {
    return {
      id: `draft_${Date.now()}`,
      user_id: 'user_123',
      league_id: 'league_123',
      name: `Test Draft ${Date.now()}`,
      year: '2024',
      notes: 'Generated test draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides
    };
  }
}
```

## Browser Configuration

### Device and Viewport Testing

```typescript
// config/browser-configs.ts
export const browserConfigs = {
  desktop: {
    chromium: {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    },
    firefox: {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:91.0) Gecko/20100101 Firefox/91.0'
    },
    webkit: {
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
    }
  },
  mobile: {
    iphone: {
      viewport: { width: 375, height: 812 },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15',
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    },
    android: {
      viewport: { width: 412, height: 915 },
      userAgent: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36',
      deviceScaleFactor: 2.625,
      isMobile: true,
      hasTouch: true
    }
  }
};
```

## Monitoring and Reporting

### Test Metrics Collection

```typescript
// utils/test-metrics.ts
interface TestMetrics {
  testName: string;
  duration: number;
  status: 'passed' | 'failed' | 'skipped';
  retries: number;
  browser: string;
  timestamp: Date;
}

export class MetricsCollector {
  private static metrics: TestMetrics[] = [];

  static recordTest(metrics: TestMetrics) {
    this.metrics.push(metrics);
  }

  static generateReport() {
    const summary = {
      total: this.metrics.length,
      passed: this.metrics.filter(m => m.status === 'passed').length,
      failed: this.metrics.filter(m => m.status === 'failed').length,
      averageDuration: this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length,
      flakiestTests: this.getFlakiestTests()
    };

    return summary;
  }

  private static getFlakiestTests() {
    const retryMap = new Map<string, number>();
    
    this.metrics.forEach(metric => {
      if (metric.retries > 0) {
        retryMap.set(metric.testName, (retryMap.get(metric.testName) || 0) + metric.retries);
      }
    });

    return Array.from(retryMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);
  }
}
```

---

This technical architecture provides a robust foundation for implementing E2E testing with Playwright, focusing on maintainability, performance, and reliability while addressing the specific needs of the Draft Builder application.