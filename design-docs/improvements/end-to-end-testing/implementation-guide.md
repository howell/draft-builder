# Implementation Guide: E2E Testing with Playwright

## Phase 1: Project Setup and Configuration

### Step 1: Install Playwright and Dependencies

```bash
# Install Playwright and required packages
npm install --save-dev @playwright/test
npm install --save-dev @faker-js/faker  # For test data generation
npm install --save-dev msw              # For API mocking
npm install --save-dev allure-playwright # For enhanced reporting

# Install Playwright browsers
npx playwright install --with-deps
```

### Step 2: Initialize Playwright Configuration

Create `playwright.config.ts` in the project root:

```typescript
import { defineConfig, devices } from '@playwright/test';

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
    ...(process.env.CI ? [['github']] : []),
    ...(process.env.ALLURE_RESULTS_DIR ? [['allure-playwright']] : [])
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
      NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL_TEST || 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY_TEST || ''
    }
  }
});
```

### Step 3: Create Project Structure

```bash
mkdir -p e2e/{tests,fixtures,page-objects,utils,config,reports}
mkdir -p e2e/tests/{auth,platform-integration,mock-drafts,analytics,cross-browser}
mkdir -p e2e/fixtures/{test-data,api-mocks}
mkdir -p e2e/reports/{html,junit,json,allure}
```

### Step 4: Environment Configuration

Create `e2e/config/test-environments.ts`:

```typescript
export interface TestEnvironment {
  name: string;
  baseUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  databaseUrl: string;
  mockApiServer?: string;
}

export const environments: Record<string, TestEnvironment> = {
  local: {
    name: 'Local Development',
    baseUrl: 'http://localhost:3000',
    supabaseUrl: process.env.SUPABASE_URL_LOCAL || 'http://localhost:54321',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY_LOCAL || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY_LOCAL || '',
    databaseUrl: 'postgresql://postgres:postgres@localhost:54322/postgres'
  },
  ci: {
    name: 'CI Environment',
    baseUrl: 'http://localhost:3000',
    supabaseUrl: process.env.SUPABASE_URL_CI || 'http://localhost:54321',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY_CI || '',
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY_CI || '',
    databaseUrl: process.env.DATABASE_URL_CI || ''
  }
};

export function getEnvironment(): TestEnvironment {
  const env = process.env.TEST_ENV || 'local';
  const environment = environments[env];
  
  if (!environment) {
    throw new Error(`Unknown test environment: ${env}`);
  }
  
  return environment;
}
```

## Phase 2: Base Infrastructure Setup

### Step 1: Create Base Page Object

Create `e2e/page-objects/base-page.ts`:

```typescript
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
      path: `e2e/reports/screenshots/${name}-${Date.now()}.png`,
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

  protected async fillWithClear(selector: string, value: string) {
    await this.page.locator(selector).clear();
    await this.page.locator(selector).fill(value);
  }

  async expectPageTitle(title: string) {
    await expect(this.page).toHaveTitle(title);
  }

  async expectURL(url: RegExp | string) {
    await expect(this.page).toHaveURL(url);
  }
}
```

### Step 2: Create Database Utilities

Create `e2e/utils/database-helpers.ts`:

```typescript
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../../src/lib/database.types';
import { getEnvironment } from '../config/test-environments';

export class DatabaseHelpers {
  private supabase: SupabaseClient<Database>;
  private environment = getEnvironment();

  constructor() {
    this.supabase = createClient<Database>(
      this.environment.supabaseUrl,
      this.environment.supabaseServiceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  async createTestUser(userData: {
    email?: string;
    password?: string;
  } = {}) {
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
    return { user: data.user, credentials: user };
  }

  async createTestLeague(userId: string, leagueData: Partial<Database['public']['Tables']['leagues']['Insert']> = {}) {
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

  async createTestDraftSession(
    userId: string, 
    leagueId: string, 
    draftData: Partial<Database['public']['Tables']['draft_sessions']['Insert']> = {}
  ) {
    const defaultDraft = {
      user_id: userId,
      league_id: leagueId,
      name: `Test Draft ${Date.now()}`,
      year: '2024',
      notes: 'E2E test draft'
    };

    const draft = { ...defaultDraft, ...draftData };

    const { data, error } = await this.supabase
      .from('draft_sessions')
      .insert(draft)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async cleanupUser(userId: string) {
    // Clean up in dependency order
    const { data: draftSessions } = await this.supabase
      .from('draft_sessions')
      .select('id')
      .eq('user_id', userId);

    if (draftSessions?.length) {
      const draftIds = draftSessions.map(d => d.id);
      
      await this.supabase
        .from('player_selections')
        .delete()
        .in('draft_session_id', draftIds);
      
      await this.supabase
        .from('cost_adjustments')
        .delete()
        .in('draft_session_id', draftIds);
      
      await this.supabase
        .from('draft_settings')
        .delete()
        .in('draft_session_id', draftIds);
    }
    
    await this.supabase
      .from('draft_sessions')
      .delete()
      .eq('user_id', userId);
    
    await this.supabase
      .from('leagues')
      .delete()
      .eq('user_id', userId);
    
    await this.supabase
      .from('in_progress_selections')
      .delete()
      .eq('user_id', userId);
    
    await this.supabase.auth.admin.deleteUser(userId);
  }

  async resetDatabase() {
    // WARNING: Only use in test environments
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Database reset only allowed in test environment');
    }

    // Delete all test data
    await this.supabase.from('player_selections').delete().neq('id', '');
    await this.supabase.from('cost_adjustments').delete().neq('id', '');
    await this.supabase.from('draft_settings').delete().neq('id', '');
    await this.supabase.from('draft_sessions').delete().neq('id', '');
    await this.supabase.from('leagues').delete().neq('id', '');
    await this.supabase.from('in_progress_selections').delete().neq('id', '');
  }
}
```

### Step 3: Create Test Data Factory

Create `e2e/utils/test-data-factory.ts`:

```typescript
import { faker } from '@faker-js/faker';

export class TestDataFactory {
  static createUserCredentials() {
    return {
      email: faker.internet.email(),
      password: 'TestPassword123!'
    };
  }

  static createLeagueData(platform: 'espn' | 'sleeper' = 'sleeper') {
    return {
      league_id: faker.number.int({ min: 100000, max: 999999 }).toString(),
      platform,
      auth_data_encrypted: null
    };
  }

  static createDraftData() {
    return {
      name: `${faker.word.adjective()} ${faker.word.noun()} Draft`,
      year: '2024',
      notes: faker.lorem.sentence()
    };
  }

  static createPlayerData() {
    const positions = ['QB', 'RB', 'WR', 'TE'];
    const teams = ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE'];
    
    return {
      id: faker.string.uuid(),
      name: `${faker.person.firstName()} ${faker.person.lastName()}`,
      position: faker.helpers.arrayElement(positions),
      team: faker.helpers.arrayElement(teams),
      projectedCost: faker.number.int({ min: 1, max: 50 })
    };
  }

  static createMockESPNLeagueResponse(leagueId: string) {
    return {
      id: parseInt(leagueId),
      settings: {
        name: faker.company.name() + ' League',
        size: 12,
        scoringSettings: {
          scoringItems: [
            { statId: 0, points: 1 }, // Passing yards
            { statId: 1, points: 6 }, // Passing TDs
            { statId: 20, points: 0.1 } // Receiving yards
          ]
        },
        rosterSettings: {
          lineupSlotCounts: {
            0: 1, // QB
            2: 2, // RB
            4: 2, // WR
            6: 1, // TE
            23: 1 // FLEX
          }
        }
      }
    };
  }

  static createMockSleeperLeagueResponse(leagueId: string) {
    return {
      league_id: leagueId,
      name: faker.company.name() + ' Sleeper League',
      avatar: faker.image.avatar(),
      season: '2024',
      season_type: 'regular',
      total_rosters: 12,
      status: 'complete',
      sport: 'nfl',
      settings: {
        max_keepers: 0,
        draft_rounds: 16,
        trade_deadline: 12,
        playoff_teams: 6,
        num_teams: 12,
        leg: 1,
        playoff_round_type: 0,
        taxi_deadline: 0,
        reserve_slots: 0,
        playoff_seed_type: 0,
        squads: 1,
        playoff_type: 0,
        max_trades: 999,
        pick_trading: 1,
        disable_adds: 0,
        waiver_budget: 100,
        bench_lock: 0,
        reserve_allow_sus: 0,
        type: 2,
        waiver_clear_days: 1,
        daily_waivers_last_ran: 15,
        waiver_day_of_week: 2,
        start_week: 1,
        playoff_week_start: 15,
        daily_waivers_days: 1087,
        last_scored_leg: 16,
        taxi_years: 0,
        trade_review_days: 1,
        league_average_match: 0,
        waiver_type: 2,
        last_report: 16,
        disable_trades: 0,
        taxi_allow_vets: 0,
        best_ball: 0,
        last_league_winner_roster_id: null,
        waiver_budget_type: 0,
        reserve_allow_out: 0,
        offseason_adds: 0,
        playoff_round_type_2: 0,
        dynasty: 0,
        reserve_allow_doubtful: 0,
        waiver_clear_days_2: 1,
        taxi_slots: 0,
        veto_votes_needed: 0,
        reserve_allow_dnr: 0,
        commissioner_direct_invite: 0,
        reserve_allow_na: 0,
        veto_auto_poll: 0,
        reserve_allow_cov: 0,
        waiver_clear_days_1: 1,
        playoff_round_type_1: 0,
        faaB_budget: 1000,
        playoff_round_type_0: 0,
        reserve_allow_ir: 0,
        offseason_draft_rounds: 0,
        veto_show_votes: 0,
        max_subs: 0,
        draft_pick_trading: 1,
        disable_roster_positions: 0,
        best_ball_1: 0,
        playoff_teams_2: 6,
        playoff_teams_1: 6,
        playoff_teams_0: 6,
        veto_votes_needed_0: 0,
        veto_votes_needed_1: 0,
        veto_votes_needed_2: 0,
        capacity_override: 0,
        enforce_position_limits: 1
      },
      scoring_settings: {
        st_fum_rec: 1,
        pts_allow_7_13: 1,
        def_st_fum_rec: 1,
        st_fum_rec_td: 6,
        def_st_ff: 1,
        st_ff: 1,
        pts_allow_1_6: 3,
        fum_rec_td: 6,
        def_td: 6,
        def_st_fum_rec_td: 6,
        def_st_td: 6,
        def_pr_yd: 0.04,
        def_kr_yd: 0.04,
        st_td: 6,
        def_st_ff: 1,
        pts_allow_28_34: -1,
        fum_rec: 1,
        def_fum_rec: 1,
        def_fum_rec_td: 6,
        pts_allow_0: 5,
        pts_allow_21_27: 0,
        def_int_td: 6,
        st_fum_rec_yd: 0.1,
        def_int: 1,
        def_fum_rec_yd: 0.1,
        pts_allow_35p: -3,
        pts_allow_14_20: 1,
        safe: 2,
        def_sack: 1,
        int: 1,
        fum_lost: -1,
        def_int_yd: 0.1,
        pts_allow_7_13: 1,
        rec_yd: 0.1,
        pt_miss: -1,
        rec_2pt: 2,
        rush_2pt: 2,
        xpm: 1,
        blk_kick: 1.5,
        pts_allow_1_6: 3,
        fgm_50p: 5,
        fgmiss: -1,
        rec_td: 6,
        rec: 0.5,
        fgm_40_49: 4,
        fgm_30_39: 3,
        fgm_20_29: 3,
        fgm_0_19: 3,
        pts_allow_14_20: 1,
        pts_allow_21_27: 0,
        pts_allow_28_34: -1,
        pts_allow_35p: -3,
        fgm: 3,
        rush_yd: 0.1,
        pass_2pt: 2,
        pass_int: -1,
        pass_td: 4,
        rush_td: 6,
        pass_yd: 0.04,
        pts_allow_0: 5,
        fum: -1
      },
      roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN', 'BN', 'BN']
    };
  }
}
```

## Phase 3: API Mocking Setup

### Step 1: Configure MSW (Mock Service Worker)

Create `e2e/utils/api-mocks.ts`:

```typescript
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { TestDataFactory } from './test-data-factory';

const mockHandlers = [
  // ESPN API mocks
  rest.get('https://fantasy.espn.com/apis/v3/games/ffl/seasons/:year/segments/0/leagues/:leagueId', (req, res, ctx) => {
    const { leagueId } = req.params;
    
    if (leagueId === 'invalid') {
      return res(ctx.status(404));
    }
    
    if (leagueId === 'private-no-auth') {
      return res(ctx.status(401));
    }
    
    const mockResponse = TestDataFactory.createMockESPNLeagueResponse(leagueId as string);
    return res(ctx.status(200), ctx.json(mockResponse));
  }),

  // Sleeper API mocks
  rest.get('https://api.sleeper.app/v1/league/:leagueId', (req, res, ctx) => {
    const { leagueId } = req.params;
    
    if (leagueId === 'invalid') {
      return res(ctx.status(404));
    }
    
    const mockResponse = TestDataFactory.createMockSleeperLeagueResponse(leagueId as string);
    return res(ctx.status(200), ctx.json(mockResponse));
  }),

  // Player data mocks
  rest.get('https://api.sleeper.app/v1/players/nfl', (req, res, ctx) => {
    const players = Array.from({ length: 50 }, () => TestDataFactory.createPlayerData());
    const playersMap = Object.fromEntries(
      players.map(player => [player.id, player])
    );
    return res(ctx.status(200), ctx.json(playersMap));
  }),

  // Error scenarios
  rest.get('https://fantasy.espn.com/apis/v3/games/ffl/seasons/:year/segments/0/leagues/500error', (req, res, ctx) => {
    return res(ctx.status(500));
  }),

  rest.get('https://api.sleeper.app/v1/league/timeout', (req, res, ctx) => {
    return res(ctx.delay('infinite'));
  })
];

export const server = setupServer(...mockHandlers);

export function setupAPIServer() {
  beforeAll(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
  });
  
  afterEach(() => {
    server.resetHandlers();
  });
  
  afterAll(() => {
    server.close();
  });
}
```

### Step 2: Create Global Test Setup

Create `e2e/config/global-setup.ts`:

```typescript
import { chromium, FullConfig } from '@playwright/test';
import { DatabaseHelpers } from '../utils/database-helpers';
import { server } from '../utils/api-mocks';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global test setup...');
  
  // Start API mocking server
  server.listen({ onUnhandledRequest: 'bypass' });
  console.log('✅ API mock server started');
  
  // Initialize database helpers
  const dbHelpers = new DatabaseHelpers();
  
  // Reset test database (if in test environment)
  if (process.env.NODE_ENV === 'test') {
    await dbHelpers.resetDatabase();
    console.log('✅ Test database reset');
  }
  
  // Verify application is accessible
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  try {
    const baseURL = config.use?.baseURL || 'http://localhost:3000';
    await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('✅ Application is accessible');
  } catch (error) {
    console.error('❌ Failed to access application:', error);
    throw error;
  } finally {
    await browser.close();
  }
  
  console.log('🎉 Global setup completed successfully');
}

export default globalSetup;
```

Create `e2e/config/global-teardown.ts`:

```typescript
import { server } from '../utils/api-mocks';
import { DatabaseHelpers } from '../utils/database-helpers';

async function globalTeardown() {
  console.log('🧹 Starting global test teardown...');
  
  // Stop API mocking server
  server.close();
  console.log('✅ API mock server stopped');
  
  // Final database cleanup (if needed)
  if (process.env.NODE_ENV === 'test' && process.env.CLEANUP_ON_TEARDOWN) {
    const dbHelpers = new DatabaseHelpers();
    await dbHelpers.resetDatabase();
    console.log('✅ Final database cleanup completed');
  }
  
  console.log('🎉 Global teardown completed');
}

export default globalTeardown;
```

## Phase 4: Page Objects Implementation

### Step 1: Authentication Page Objects

Create `e2e/page-objects/auth-page.ts`:

```typescript
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';

export class AuthPage extends BasePage {
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly signupButton: Locator;
  readonly switchToSignupButton: Locator;
  readonly switchToLoginButton: Locator;
  readonly errorMessage: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('[data-testid="email-input"]');
    this.passwordInput = page.locator('[data-testid="password-input"]');
    this.loginButton = page.locator('[data-testid="login-button"]');
    this.signupButton = page.locator('[data-testid="signup-button"]');
    this.switchToSignupButton = page.locator('[data-testid="switch-to-signup"]');
    this.switchToLoginButton = page.locator('[data-testid="switch-to-login"]');
    this.errorMessage = page.locator('[data-testid="auth-error"]');
    this.successMessage = page.locator('[data-testid="auth-success"]');
  }

  async navigateToAuth() {
    await this.page.goto('/auth');
    await this.waitForLoad();
  }

  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await this.waitForLoad();
  }

  async signup(email: string, password: string) {
    await this.switchToSignupButton.click();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.signupButton.click();
    await this.waitForLoad();
  }

  async expectLoginSuccess() {
    await expect(this.page).toHaveURL(/\/league|\/$/);
  }

  async expectSignupSuccess() {
    await expect(this.successMessage).toBeVisible();
  }

  async expectAuthError(message?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }
}
```

### Step 2: Home Page Objects

Create `e2e/page-objects/home-page.ts`:

```typescript
import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base-page';

export class HomePage extends BasePage {
  readonly espnTab: Locator;
  readonly sleeperTab: Locator;
  readonly demoLink: Locator;
  readonly leagueIdInput: Locator;
  readonly submitButton: Locator;
  readonly loadingIndicator: Locator;
  readonly errorMessage: Locator;
  readonly sidebar: Locator;

  constructor(page: Page) {
    super(page);
    this.espnTab = page.locator('[data-testid="espn-tab"]');
    this.sleeperTab = page.locator('[data-testid="sleeper-tab"]');
    this.demoLink = page.locator('[data-testid="demo-link"]');
    this.leagueIdInput = page.locator('[data-testid="league-id-input"]');
    this.submitButton = page.locator('[data-testid="submit-league"]');
    this.loadingIndicator = page.locator('[data-testid="loading-screen"]');
    this.errorMessage = page.locator('[data-testid="error-message"]');
    this.sidebar = page.locator('[data-testid="sidebar"]');
  }

  async navigateToHome() {
    await this.page.goto('/');
    await this.waitForLoad();
  }

  async navigateToDemo() {
    await this.demoLink.click();
    await this.waitForLoad();
  }

  async selectPlatform(platform: 'espn' | 'sleeper') {
    if (platform === 'espn') {
      await this.espnTab.click();
    } else {
      await this.sleeperTab.click();
    }
    await this.page.waitForTimeout(500); // Allow tab transition
  }

  async connectLeague(leagueId: string) {
    await this.leagueIdInput.fill(leagueId);
    await this.submitButton.click();
    
    // Wait for either success (navigation) or error
    await Promise.race([
      this.page.waitForURL(/\/league/, { timeout: 30000 }),
      this.errorMessage.waitFor({ state: 'visible', timeout: 30000 })
    ]);
  }

  async expectLeagueConnectionSuccess() {
    await expect(this.page).toHaveURL(/\/league/);
  }

  async expectLeagueConnectionError(message?: string) {
    await expect(this.errorMessage).toBeVisible();
    if (message) {
      await expect(this.errorMessage).toContainText(message);
    }
  }

  async expectSidebarVisible() {
    await expect(this.sidebar).toBeVisible();
  }
}
```

## Phase 5: First Test Implementation

### Step 1: Basic Authentication Test

Create `e2e/tests/auth/login.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { AuthPage } from '../../page-objects/auth-page';
import { HomePage } from '../../page-objects/home-page';
import { DatabaseHelpers } from '../../utils/database-helpers';
import { TestDataFactory } from '../../utils/test-data-factory';

test.describe('User Authentication', () => {
  let dbHelpers: DatabaseHelpers;
  let authPage: AuthPage;
  let homePage: HomePage;

  test.beforeEach(async ({ page }) => {
    dbHelpers = new DatabaseHelpers();
    authPage = new AuthPage(page);
    homePage = new HomePage(page);
  });

  test.afterEach(async () => {
    // Cleanup any created test users
    // Note: In a real implementation, track created users for cleanup
  });

  test('should register new user successfully', async ({ page }) => {
    const credentials = TestDataFactory.createUserCredentials();
    
    await authPage.navigateToAuth();
    await authPage.signup(credentials.email, credentials.password);
    
    await authPage.expectSignupSuccess();
    // Should redirect to home page after successful signup
    await homePage.expectLeagueConnectionSuccess();
  });

  test('should login existing user successfully', async ({ page }) => {
    // Create test user in database
    const { user, credentials } = await dbHelpers.createTestUser();
    
    await authPage.navigateToAuth();
    await authPage.login(credentials.email, credentials.password);
    
    await authPage.expectLoginSuccess();
    
    // Cleanup
    await dbHelpers.cleanupUser(user.id);
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await authPage.navigateToAuth();
    await authPage.login('invalid@example.com', 'wrongpassword');
    
    await authPage.expectAuthError('Invalid email or password');
  });

  test('should validate email format', async ({ page }) => {
    await authPage.navigateToAuth();
    await authPage.signup('invalid-email', 'ValidPassword123!');
    
    await authPage.expectAuthError('Invalid email format');
  });
});
```

### Step 2: Platform Integration Test

Create `e2e/tests/platform-integration/sleeper-connection.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { HomePage } from '../../page-objects/home-page';
import { DatabaseHelpers } from '../../utils/database-helpers';
import { setupAPIServer } from '../../utils/api-mocks';

test.describe('Sleeper League Integration', () => {
  let homePage: HomePage;
  let dbHelpers: DatabaseHelpers;
  
  setupAPIServer();

  test.beforeEach(async ({ page }) => {
    homePage = new HomePage(page);
    dbHelpers = new DatabaseHelpers();
    
    // Create authenticated user session
    const { user } = await dbHelpers.createTestUser();
    // TODO: Implement session setup helper
  });

  test('should connect to valid Sleeper league', async ({ page }) => {
    await homePage.navigateToHome();
    await homePage.selectPlatform('sleeper');
    await homePage.connectLeague('123456789'); // This will be mocked
    
    await homePage.expectLeagueConnectionSuccess();
  });

  test('should handle invalid Sleeper league ID', async ({ page }) => {
    await homePage.navigateToHome();
    await homePage.selectPlatform('sleeper');
    await homePage.connectLeague('invalid');
    
    await homePage.expectLeagueConnectionError('League not found');
  });

  test('should display league information after connection', async ({ page }) => {
    await homePage.navigateToHome();
    await homePage.selectPlatform('sleeper');
    await homePage.connectLeague('123456789');
    
    await homePage.expectLeagueConnectionSuccess();
    
    // Verify league information is displayed
    await expect(page.locator('[data-testid="league-name"]')).toContainText('Sleeper League');
    await expect(page.locator('[data-testid="league-size"]')).toContainText('12');
  });
});
```

## Phase 6: Package.json Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:debug": "playwright test --debug",
    "e2e:headed": "playwright test --headed",
    "e2e:smoke": "playwright test --grep @smoke",
    "e2e:chrome": "playwright test --project=chromium-desktop",
    "e2e:firefox": "playwright test --project=firefox-desktop",
    "e2e:safari": "playwright test --project=webkit-desktop",
    "e2e:mobile": "playwright test --project=mobile-chrome --project=mobile-safari",
    "e2e:report": "playwright show-report e2e/reports/html",
    "e2e:install": "playwright install --with-deps",
    "e2e:codegen": "playwright codegen localhost:3000"
  }
}
```

## Phase 7: Environment Variables

Create `.env.test` file:

```bash
NODE_ENV=test
BASE_URL=http://localhost:3000

# Supabase Test Configuration
SUPABASE_URL_LOCAL=http://localhost:54321
SUPABASE_ANON_KEY_LOCAL=your_local_anon_key
SUPABASE_SERVICE_ROLE_KEY_LOCAL=your_local_service_key

# CI Configuration
SUPABASE_URL_CI=http://localhost:54321
SUPABASE_ANON_KEY_CI=your_ci_anon_key
SUPABASE_SERVICE_ROLE_KEY_CI=your_ci_service_key
DATABASE_URL_CI=postgresql://postgres:postgres@localhost:54322/postgres

# Test Configuration
TEST_ENV=local
CLEANUP_ON_TEARDOWN=true
ALLURE_RESULTS_DIR=e2e/reports/allure-results
```

## Phase 8: VS Code Configuration

Create `.vscode/launch.json` for debugging:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Playwright Tests",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/playwright",
      "args": ["test", "--debug"],
      "console": "integratedTerminal"
    },
    {
      "name": "Debug Single Playwright Test",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/playwright",
      "args": ["test", "${relativeFile}", "--debug"],
      "console": "integratedTerminal"
    }
  ]
}
```

## Next Steps

1. **Run Initial Setup**:
   ```bash
   npm install
   npm run e2e:install
   ```

2. **Start Development Server**:
   ```bash
   npm run dev
   ```

3. **Run First Tests**:
   ```bash
   npm run e2e:smoke
   ```

4. **View Test Report**:
   ```bash
   npm run e2e:report
   ```

5. **Continue with Phase 2**: Implement remaining page objects and test scenarios as defined in the test scenarios document.

This implementation guide provides a solid foundation for E2E testing with Playwright, focusing on maintainable, reliable tests that align with the Draft Builder application's architecture and requirements.