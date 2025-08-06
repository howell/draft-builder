# End-to-End Testing with Playwright

This directory contains the end-to-end testing infrastructure for the Draft Builder application using Playwright.

## Getting Started

### Installation

```bash
# Install Playwright and dependencies
npm install

# Install Playwright browsers
npm run e2e:install
```

### Running Tests

```bash
# Run all e2e tests
npm run e2e

# Run tests in UI mode (interactive)
npm run e2e:ui

# Run tests in headed mode (see browser)
npm run e2e:headed

# Debug tests
npm run e2e:debug

# Run specific browser tests
npm run e2e:chrome
npm run e2e:firefox
npm run e2e:safari

# Run mobile tests
npm run e2e:mobile

# Run smoke tests only
npm run e2e:smoke

# View test report
npm run e2e:report

# Generate test code (record interactions)
npm run e2e:codegen
```

## Project Structure

```
e2e/
├── tests/                    # Test specifications
│   ├── auth/                # Authentication tests
│   ├── platform-integration/ # ESPN/Sleeper integration tests
│   ├── mock-drafts/         # Mock draft functionality tests
│   ├── analytics/           # Analytics and visualization tests
│   └── cross-browser/       # Browser compatibility tests
├── page-objects/            # Page Object Model implementations
│   ├── base-page.ts        # Base page class
│   ├── auth-page.ts        # Authentication page
│   ├── home-page.ts        # Home/landing page
│   └── mock-draft-page.ts  # Mock draft page
├── utils/                   # Test utilities
│   ├── database-helpers.ts # Database setup/teardown
│   ├── test-data-factory.ts # Test data generation
│   └── api-mocks.ts        # MSW API mocking
├── fixtures/               # Test fixtures and data
├── config/                 # Configuration files
│   └── test-environments.ts # Environment configurations
└── reports/               # Test reports (gitignored)
```

## Writing Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';
import { HomePage } from '../page-objects/home-page';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    const homePage = new HomePage(page);
    
    await homePage.navigateToHome();
    await expect(page).toHaveTitle(/Draft Builder/);
  });
});
```

### Using Page Objects

Page objects encapsulate page interactions and make tests more maintainable:

```typescript
// In page object
export class AuthPage extends BasePage {
  async login(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.loginButton.click();
  }
}

// In test
const authPage = new AuthPage(page);
await authPage.login('user@example.com', 'password');
```

### Database Helpers

The project reuses existing test utilities from the main codebase:

```typescript
import { DatabaseHelpers } from '../utils/database-helpers';

const dbHelpers = new DatabaseHelpers();
const { user, credentials } = await dbHelpers.createTestUser();
// ... run tests
await dbHelpers.cleanupUser(user.id);
```

### API Mocking

Tests use MSW (Mock Service Worker) for API mocking:

```typescript
import { setupAPIServer } from '../utils/api-mocks';

test.describe('API Tests', () => {
  setupAPIServer(); // Sets up before all, resets after each, tears down after all
  
  test('should handle API response', async ({ page }) => {
    // API calls will be intercepted and mocked
  });
});
```

## Environment Configuration

Tests can run against different environments:

```bash
# Local development (default)
TEST_ENV=local npm run e2e

# CI environment
TEST_ENV=ci npm run e2e
```

Configure environments in `e2e/config/test-environments.ts`.

## Best Practices

1. **Use Page Objects**: Encapsulate page interactions in page objects
2. **Clean Up Data**: Always clean up test data in `afterEach` hooks
3. **Mock External APIs**: Use MSW to mock ESPN/Sleeper APIs
4. **Test User Journeys**: Focus on complete user workflows
5. **Parallel Execution**: Tests run in parallel by default for speed
6. **Retry Flaky Tests**: CI runs retry failed tests automatically
7. **Use Existing Utilities**: Leverage test utilities from `src/lib/storage/__tests__/test-utils/`

## Debugging

### Visual Debugging

```bash
# Opens Playwright Inspector
npm run e2e:debug

# Runs with browser visible
npm run e2e:headed

# Interactive UI mode
npm run e2e:ui
```

### Generating Tests

Use the codegen tool to record interactions:

```bash
npm run e2e:codegen
```

### Traces and Screenshots

Failed tests automatically capture:
- Screenshots
- Videos (on failure)
- Traces (on retry)

View them in the HTML report:

```bash
npm run e2e:report
```

## CI/CD Integration

Tests are configured to run in CI with:
- Parallel execution across 4 workers
- Automatic retries (2 attempts)
- GitHub Actions reporter
- JUnit XML output for CI systems

## Troubleshooting

### Environment Variable Issues

If you get "Missing Supabase environment variables" error:

1. **Check environment file**: Ensure `.env.test.local` exists with required variables:
   ```bash
   npm run e2e:check-env
   ```

2. **Copy from example**: 
   ```bash
   cp .env.test.example .env.test.local
   ```

3. **Fill in your values**: Edit `.env.test.local` with your local Supabase credentials:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_local_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

### Browsers Not Installed

```bash
npm run e2e:install
```

### Port Already in Use

The dev server might already be running. Either:
- Stop it: `npm run dev:stop`
- Let tests reuse it (default in local env)

### Database Connection Issues

Ensure Supabase is running:
```bash
npm run dev:db
```

### Test Timeouts

Increase timeouts in `playwright.config.ts`:
```typescript
use: {
  actionTimeout: 60000,
  navigationTimeout: 60000
}
```

## Contributing

When adding new tests:
1. Follow the existing structure
2. Add page objects for new pages
3. Update this README if adding new patterns
4. Ensure tests are reliable and not flaky
5. Tag smoke tests with `@smoke` annotation

## Related Documentation

- [E2E Testing Strategy](../design-docs/improvements/end-to-end-testing/README.md)
- [Technical Architecture](../design-docs/improvements/end-to-end-testing/technical-architecture.md)
- [Test Scenarios](../design-docs/improvements/end-to-end-testing/test-scenarios.md)
- [Implementation Guide](../design-docs/improvements/end-to-end-testing/implementation-guide.md)