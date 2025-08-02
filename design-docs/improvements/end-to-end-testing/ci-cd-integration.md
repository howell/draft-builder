# CI/CD Integration Guide for E2E Testing

## Overview

This document outlines the complete CI/CD integration strategy for E2E testing with Playwright, including GitHub Actions workflows, environment management, and deployment testing strategies.

## GitHub Actions Workflow Configuration

### Primary E2E Testing Workflow

Create `.github/workflows/e2e-tests.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]
  schedule:
    # Run daily at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch:
    inputs:
      test_suite:
        description: 'Test suite to run'
        required: true
        default: 'smoke'
        type: choice
        options:
          - smoke
          - regression
          - full
      browser:
        description: 'Browser to test'
        required: false
        default: 'all'
        type: choice
        options:
          - all
          - chromium
          - firefox
          - webkit

env:
  NODE_ENV: test
  BASE_URL: http://localhost:3000

jobs:
  e2e-tests:
    timeout-minutes: 60
    runs-on: ubuntu-latest
    
    strategy:
      fail-fast: false
      matrix:
        project: [chromium-desktop, firefox-desktop, webkit-desktop]
        exclude:
          # Skip WebKit on pull requests to save resources
          - project: webkit-desktop
            # Only exclude on PR events, not on push to main
        include:
          # Add mobile tests only on main branch pushes and scheduled runs
          - project: mobile-chrome
            run-on: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' || github.event_name == 'schedule' }}
          - project: mobile-safari
            run-on: ${{ github.event_name == 'push' && github.ref == 'refs/heads/main' || github.event_name == 'schedule' }}

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_USER: postgres
          POSTGRES_DB: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 54322:5432

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1
        with:
          version: latest

      - name: Start Supabase local development setup
        run: |
          supabase start
          # Extract API URL and anon key for tests
          echo "SUPABASE_URL_CI=$(supabase status -o env | grep API_URL | cut -d'=' -f2)" >> $GITHUB_ENV
          echo "SUPABASE_ANON_KEY_CI=$(supabase status -o env | grep ANON_KEY | cut -d'=' -f2)" >> $GITHUB_ENV
          echo "SUPABASE_SERVICE_ROLE_KEY_CI=$(supabase status -o env | grep SERVICE_ROLE_KEY | cut -d'=' -f2)" >> $GITHUB_ENV

      - name: Run database migrations
        run: |
          # Apply any pending migrations
          supabase db push
          # Seed test data if needed
          npm run db:seed:test 2>/dev/null || echo "No test seed script found"

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Build application
        run: npm run build

      - name: Determine test suite
        id: test-suite
        run: |
          if [ "${{ github.event.inputs.test_suite }}" != "" ]; then
            echo "suite=${{ github.event.inputs.test_suite }}" >> $GITHUB_OUTPUT
          elif [ "${{ github.event_name }}" == "pull_request" ]; then
            echo "suite=smoke" >> $GITHUB_OUTPUT
          elif [ "${{ github.event_name }}" == "schedule" ]; then
            echo "suite=full" >> $GITHUB_OUTPUT
          else
            echo "suite=regression" >> $GITHUB_OUTPUT
          fi

      - name: Run Playwright tests
        run: |
          case "${{ steps.test-suite.outputs.suite }}" in
            smoke)
              npx playwright test --grep="@smoke" --project=${{ matrix.project }}
              ;;
            regression)
              npx playwright test --grep-invert="@slow" --project=${{ matrix.project }}
              ;;
            full)
              npx playwright test --project=${{ matrix.project }}
              ;;
          esac
        env:
          SUPABASE_URL_LOCAL: ${{ env.SUPABASE_URL_CI }}
          SUPABASE_ANON_KEY_LOCAL: ${{ env.SUPABASE_ANON_KEY_CI }}
          SUPABASE_SERVICE_ROLE_KEY_LOCAL: ${{ env.SUPABASE_SERVICE_ROLE_KEY_CI }}
          DATABASE_URL_CI: postgresql://postgres:postgres@localhost:54322/postgres

      - name: Upload test results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results-${{ matrix.project }}-${{ github.run_number }}
          path: |
            e2e/reports/
            test-results/
          retention-days: 30

      - name: Upload Playwright HTML Report
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report-${{ matrix.project }}-${{ github.run_number }}
          path: e2e/reports/html/
          retention-days: 14

      - name: Comment PR with test results
        uses: actions/github-script@v7
        if: failure() && github.event_name == 'pull_request'
        with:
          script: |
            const project = '${{ matrix.project }}';
            const runNumber = '${{ github.run_number }}';
            const artifactUrl = `${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}`;
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `❌ E2E tests failed for ${project}

[View detailed report](${artifactUrl}) (download artifacts)

**Failed Test Summary:**
- Project: ${project}
- Run: #${runNumber}
- Artifacts will be available for 14 days`
            });

  test-summary:
    runs-on: ubuntu-latest
    needs: e2e-tests
    if: always()
    steps:
      - name: Generate test summary
        uses: actions/github-script@v7
        with:
          script: |
            const results = ${{ toJSON(needs.e2e-tests.result) }};
            const projects = ['chromium-desktop', 'firefox-desktop', 'webkit-desktop'];
            
            let summary = '## E2E Test Results\n\n';
            
            projects.forEach(project => {
              const status = results === 'success' ? '✅' : '❌';
              summary += `- ${status} ${project}\n`;
            });
            
            summary += `\n**Run ID:** ${{ github.run_id }}`;
            summary += `\n**Commit:** ${{ github.sha }}`;
            
            github.rest.repos.createCommitComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              commit_sha: context.sha,
              body: summary
            });
```

### Smoke Test Workflow (Fast CI)

Create `.github/workflows/smoke-tests.yml`:

```yaml
name: Smoke Tests

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

env:
  NODE_ENV: test

jobs:
  smoke-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Start Supabase
        run: supabase start

      - name: Install Playwright (Chromium only)
        run: npx playwright install chromium

      - name: Run smoke tests
        run: npx playwright test --grep="@smoke" --project=chromium-desktop
        env:
          SUPABASE_URL_LOCAL: http://localhost:54321
          SUPABASE_ANON_KEY_LOCAL: ${{ secrets.SUPABASE_ANON_KEY_LOCAL }}
          SUPABASE_SERVICE_ROLE_KEY_LOCAL: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY_LOCAL }}

      - name: Upload smoke test results
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: smoke-test-results
          path: test-results/
          retention-days: 7
```

### Scheduled Full Test Suite

Create `.github/workflows/nightly-tests.yml`:

```yaml
name: Nightly E2E Tests

on:
  schedule:
    # Run every night at 2 AM UTC
    - cron: '0 2 * * *'
  workflow_dispatch:

jobs:
  full-test-suite:
    runs-on: ubuntu-latest
    timeout-minutes: 90
    
    strategy:
      matrix:
        project: 
          - chromium-desktop
          - firefox-desktop  
          - webkit-desktop
          - mobile-chrome
          - mobile-safari

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Setup Supabase CLI
        uses: supabase/setup-cli@v1

      - name: Start Supabase
        run: supabase start

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run full test suite
        run: npx playwright test --project=${{ matrix.project }}
        env:
          SUPABASE_URL_LOCAL: http://localhost:54321
          SUPABASE_ANON_KEY_LOCAL: ${{ secrets.SUPABASE_ANON_KEY_LOCAL }}
          SUPABASE_SERVICE_ROLE_KEY_LOCAL: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY_LOCAL }}

      - name: Generate Allure Report
        if: always()
        run: |
          npm install -g allure-commandline
          allure generate e2e/reports/allure-results -o e2e/reports/allure-report --clean

      - name: Upload test artifacts
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: nightly-test-results-${{ matrix.project }}
          path: |
            e2e/reports/
            test-results/
          retention-days: 7

      - name: Notify on failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            const project = '${{ matrix.project }}';
            
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Nightly E2E Test Failure - ${project}`,
              body: `🚨 Nightly E2E tests failed for ${project}
              
**Details:**
- Run ID: ${{ github.run_id }}
- Project: ${project}
- Time: ${new Date().toISOString()}

Please investigate the failures and check the test artifacts.`,
              labels: ['bug', 'e2e-tests', 'priority-high']
            });
```

## Environment Management

### Development Environment

Create `e2e/config/environments/development.ts`:

```typescript
export const developmentConfig = {
  baseUrl: 'http://localhost:3000',
  supabaseUrl: 'http://localhost:54321',
  database: {
    host: 'localhost',
    port: 54322,
    database: 'postgres',
    username: 'postgres',
    password: 'postgres'
  },
  apiMocking: true,
  testData: {
    cleanup: true,
    seed: true
  }
};
```

### Staging Environment

Create `e2e/config/environments/staging.ts`:

```typescript
export const stagingConfig = {
  baseUrl: process.env.STAGING_URL || 'https://draft-builder-staging.vercel.app',
  supabaseUrl: process.env.SUPABASE_URL_STAGING!,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY_STAGING!,
  database: {
    connectionString: process.env.DATABASE_URL_STAGING!
  },
  apiMocking: false, // Test against real APIs in staging
  testData: {
    cleanup: true,
    seed: false // Use existing staging data
  }
};
```

### Production Monitoring Tests

Create `.github/workflows/production-monitoring.yml`:

```yaml
name: Production Health Check

on:
  schedule:
    # Run every 30 minutes
    - cron: '*/30 * * * *'
  workflow_dispatch:

jobs:
  production-health:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright (Chromium only)
        run: npx playwright install chromium

      - name: Run production health checks
        run: npx playwright test --grep="@health" --project=chromium-desktop
        env:
          BASE_URL: https://your-production-url.com
          TEST_ENV: production

      - name: Alert on failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            // Create GitHub issue for production failure
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: '🚨 Production Health Check Failed',
              body: `Production health check failed at ${new Date().toISOString()}
              
**Run Details:**
- Run ID: ${{ github.run_id }}
- Commit: ${{ github.sha }}

Please investigate immediately.`,
              labels: ['production', 'critical', 'health-check']
            });
```

## Docker Integration

### E2E Test Docker Container

Create `Dockerfile.e2e`:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-focal

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Install Playwright browsers (already included in base image)
RUN npx playwright install

# Create reports directory
RUN mkdir -p e2e/reports

# Set environment variables
ENV NODE_ENV=test
ENV CI=true

# Run tests
CMD ["npm", "run", "e2e"]
```

### Docker Compose for Local Testing

Create `docker-compose.e2e.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: postgres
      POSTGRES_USER: postgres
      POSTGRES_DB: postgres
    ports:
      - "54322:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  supabase:
    image: supabase/edge-runtime:v1.0.0
    environment:
      POSTGRES_URL: postgresql://postgres:postgres@postgres:5432/postgres
    depends_on:
      postgres:
        condition: service_healthy
    ports:
      - "54321:8000"

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/postgres
      NEXT_PUBLIC_SUPABASE_URL: http://supabase:8000
    depends_on:
      - postgres
      - supabase

  e2e-tests:
    build:
      context: .
      dockerfile: Dockerfile.e2e
    environment:
      BASE_URL: http://app:3000
      NODE_ENV: test
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/postgres
    depends_on:
      - app
    volumes:
      - ./e2e/reports:/app/e2e/reports
```

## Deployment Testing Strategy

### Pre-deployment Validation

Create `.github/workflows/deploy-validation.yml`:

```yaml
name: Pre-deployment Validation

on:
  release:
    types: [published]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to validate'
        required: true
        type: choice
        options:
          - staging
          - production

jobs:
  validate-deployment:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    
    environment: ${{ github.event.inputs.environment || 'staging' }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps

      - name: Run deployment validation tests
        run: npx playwright test --grep="@deployment" --project=chromium-desktop
        env:
          BASE_URL: ${{ vars.BASE_URL }}
          TEST_ENV: ${{ github.event.inputs.environment || 'staging' }}
          SUPABASE_URL: ${{ vars.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}

      - name: Upload validation results
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: deployment-validation-results
          path: e2e/reports/
          retention-days: 30

      - name: Block deployment on failure
        if: failure()
        run: |
          echo "❌ Deployment validation failed!"
          echo "Review the test results before proceeding with deployment."
          exit 1
```

## Performance Testing Integration

### Performance Monitoring in E2E Tests

Create `e2e/utils/performance-monitor.ts`:

```typescript
import { Page, BrowserContext } from '@playwright/test';

export class PerformanceMonitor {
  constructor(private page: Page) {}

  async measurePageLoad(url: string): Promise<PerformanceMetrics> {
    const start = Date.now();
    
    await this.page.goto(url, { waitUntil: 'networkidle' });
    
    const loadTime = Date.now() - start;
    
    const metrics = await this.page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        firstPaint: performance.getEntriesByName('first-paint')[0]?.startTime || 0,
        firstContentfulPaint: performance.getEntriesByName('first-contentful-paint')[0]?.startTime || 0
      };
    });
    
    return {
      totalLoadTime: loadTime,
      ...metrics
    };
  }

  async measureInteractionTime(interaction: () => Promise<void>): Promise<number> {
    const start = Date.now();
    await interaction();
    return Date.now() - start;
  }
}

interface PerformanceMetrics {
  totalLoadTime: number;
  domContentLoaded: number;
  loadComplete: number;
  firstPaint: number;
  firstContentfulPaint: number;
}
```

### Performance Test Example

Create `e2e/tests/performance/page-load.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { PerformanceMonitor } from '../../utils/performance-monitor';

test.describe('Performance Tests', () => {
  test('home page should load within performance budget @performance', async ({ page }) => {
    const monitor = new PerformanceMonitor(page);
    
    const metrics = await monitor.measurePageLoad('/');
    
    // Performance budgets
    expect(metrics.totalLoadTime).toBeLessThan(3000); // 3 seconds
    expect(metrics.firstContentfulPaint).toBeLessThan(1500); // 1.5 seconds
    expect(metrics.domContentLoaded).toBeLessThan(1000); // 1 second
    
    console.log('Performance Metrics:', metrics);
  });

  test('mock draft should respond quickly to interactions @performance', async ({ page }) => {
    const monitor = new PerformanceMonitor(page);
    
    await page.goto('/demo');
    
    const interactionTime = await monitor.measureInteractionTime(async () => {
      await page.click('[data-testid="select-player-1"]');
      await page.waitForSelector('[data-testid="roster-updated"]');
    });
    
    expect(interactionTime).toBeLessThan(500); // 500ms for interactions
  });
});
```

## Reporting and Notifications

### Slack Integration

Create `.github/workflows/test-notifications.yml`:

```yaml
name: Test Result Notifications

on:
  workflow_run:
    workflows: ["E2E Tests"]
    types: [completed]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Notify Slack on failure
        if: ${{ github.event.workflow_run.conclusion == 'failure' }}
        uses: 8398a7/action-slack@v3
        with:
          status: failure
          text: |
            🚨 E2E Tests Failed
            Branch: ${{ github.event.workflow_run.head_branch }}
            Commit: ${{ github.event.workflow_run.head_sha }}
            View Results: ${{ github.event.workflow_run.html_url }}
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}

      - name: Notify Slack on success (main branch only)
        if: ${{ github.event.workflow_run.conclusion == 'success' && github.event.workflow_run.head_branch == 'main' }}
        uses: 8398a7/action-slack@v3
        with:
          status: success
          text: |
            ✅ E2E Tests Passed
            Branch: main
            All systems operational
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Test Dashboard

Create `e2e/utils/test-dashboard.ts`:

```typescript
export class TestDashboard {
  static async updateMetrics(results: TestResults) {
    const metrics = {
      timestamp: new Date().toISOString(),
      totalTests: results.total,
      passed: results.passed,
      failed: results.failed,
      duration: results.duration,
      flakiness: results.retries / results.total,
      browsers: results.browsers
    };

    // Send to monitoring service (e.g., DataDog, New Relic)
    await this.sendToMonitoring(metrics);
  }

  private static async sendToMonitoring(metrics: any) {
    // Implementation depends on your monitoring solution
    console.log('Test Metrics:', metrics);
  }
}
```

## Security Considerations

### Secrets Management

```yaml
# In your workflow files, always use secrets for sensitive data
env:
  SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  # Never expose production credentials in logs
```

### Environment Isolation

```typescript
// e2e/config/security.ts
export function validateTestEnvironment() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('E2E tests can only run in test environment');
  }
  
  if (process.env.BASE_URL?.includes('production-domain.com')) {
    throw new Error('Cannot run destructive tests against production');
  }
}
```

## Cost Optimization

### Resource Usage Optimization

```yaml
# Optimize GitHub Actions usage
strategy:
  matrix:
    # Reduce matrix size for PRs
    project: ${{ github.event_name == 'pull_request' && fromJSON('["chromium-desktop"]') || fromJSON('["chromium-desktop", "firefox-desktop", "webkit-desktop"]') }}

# Cancel previous runs
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

### Conditional Test Execution

```yaml
- name: Check for test-related changes
  id: changes
  uses: dorny/paths-filter@v2
  with:
    filters: |
      tests:
        - 'e2e/**'
        - 'src/**'
        - 'package*.json'

- name: Run E2E tests
  if: steps.changes.outputs.tests == 'true'
  run: npm run e2e
```

This comprehensive CI/CD integration guide provides a robust foundation for running E2E tests in various environments while maintaining cost efficiency and providing comprehensive reporting and monitoring capabilities.