# Testing Strategy for Draft Builder

## Overview

This document outlines the comprehensive testing strategy for the Draft Builder fantasy sports application. The testing framework is built on Jest with React Testing Library, providing robust unit, integration, and end-to-end testing capabilities.

## Testing Framework Setup

### Core Testing Technologies

- **Jest 29.7.0**: Primary testing framework with TypeScript support
- **React Testing Library 16.3.0**: Component testing with user-centric approach
- **@testing-library/jest-dom**: Custom matchers for DOM assertions
- **@testing-library/user-event**: Realistic user interaction simulation
- **ts-jest**: TypeScript transformation for Jest

### Configuration Files

#### Jest Configuration (`jest.config.ts`)
```typescript
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({
  dir: './',
})

const config: Config = {
  clearMocks: true,
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testEnvironment: "jsdom",
};

export default createJestConfig(config);
```

#### Setup File (`jest.setup.ts`)
```typescript
import '@testing-library/jest-dom/matchers';
import '@testing-library/jest-dom';
```

## Testing Categories

### 1. Unit Tests

**Purpose**: Test individual functions, components, and utilities in isolation.

**Scope**:
- Pure functions and utilities
- Individual React components
- API transformation functions
- Data validation logic
- Custom hooks

**Example Pattern**:
```typescript
// Component unit test
describe('LoadingScreen', () => {
    it('should display loading spinner when tasks are pending', () => {
        const task = new LoadingTask(() => false, 'Loading data...');
        render(<LoadingScreen tasks={new Set([task])} />);

        expect(screen.getByText('Loading...')).toBeInTheDocument();
        expect(screen.getByText('Loading data...')).toBeInTheDocument();
    });
});

// Utility function test
describe('Decoder', () => {
    it('should decode a valid value', () => {
        const params = new URLSearchParams({ name: JSON.stringify("John") });
        const result = Decoder.create(params)
            .decode('name', (v): v is string => typeof v === 'string')
            .finalize();

        expect(result).toEqual({ name: "John" });
    });
});
```

### 2. Integration Tests

**Purpose**: Test interactions between components and external systems.

**Scope**:
- Platform API integrations (ESPN, Sleeper)
- Database operations with Redis
- Component interactions with context
- Form submission workflows
- Data transformation pipelines

**Example Pattern**:
```typescript
describe('SleeperApi Integration', () => {
    beforeEach(() => {
        // Mock external API calls
        (fetchLeagueInfo as jest.Mock).mockReset();
    });

    it('should fetch and transform league data', async () => {
        const mockLeagueData = { league_id: '123', name: 'Test League' };
        (fetchLeagueInfo as jest.Mock).mockResolvedValue(mockLeagueData);

        const api = new SleeperApi(testLeague);
        const result = await api.fetchLeague('2024');

        expect(result).toEqual(expect.objectContaining({
            id: '123',
            name: 'Test League'
        }));
    });
});
```

### 3. Component Testing Strategy

#### Testing Approach
- **User-centric**: Test what users see and do, not implementation details
- **Accessible**: Use semantic queries (getByRole, getByLabelText)
- **Realistic**: Simulate actual user interactions
- **Isolated**: Mock external dependencies appropriately

#### Component Test Structure
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

describe('Tooltip Component', () => {
    const defaultProps = {
        text: "Test tooltip",
        children: <button>Hover me</button>
    };

    it('shows tooltip on hover after delay', async () => {
        render(<Tooltip {...defaultProps} />);
        
        const trigger = screen.getByRole('tooltip-trigger');
        fireEvent.mouseEnter(trigger);
        
        await waitFor(() => {
            expect(screen.getByText('Test tooltip')).toBeInTheDocument();
        });
    });

    it('handles touch interactions', async () => {
        const user = userEvent.setup();
        render(<Tooltip {...defaultProps} />);
        
        const trigger = screen.getByRole('tooltip-trigger');
        await user.hover(trigger);
        
        expect(screen.getByText('Test tooltip')).toBeInTheDocument();
    });
});
```

### 4. API and Platform Testing

#### Mocking Strategy
```typescript
// Mock external API modules
jest.mock('./api', () => ({
    fetchLeagueInfo: jest.fn(),
    fetchDraftInfo: jest.fn(),
    fetchLeagueTeams: jest.fn(),
}));

// Type-safe mock setup
const mockFetchLeagueInfo = fetchLeagueInfo as jest.MockedFunction<typeof fetchLeagueInfo>;

beforeEach(() => {
    mockFetchLeagueInfo.mockReset();
});
```

#### Platform API Testing Pattern
```typescript
describe('Platform API', () => {
    it('should handle API errors gracefully', async () => {
        mockFetchLeagueInfo.mockResolvedValue(404);
        
        const api = new SleeperApi(testLeague);
        const result = await api.fetchLeague('2024');
        
        expect(result).toBe(404);
    });

    it('should transform platform data correctly', async () => {
        const rawData = { user_id: "1", display_name: "Team 1" };
        const expected = { id: "1", name: "Team 1" };
        
        const result = importSleeperTeamInfo(rawData);
        
        expect(result).toEqual(expected);
    });
});
```

### 5. State Management Testing

#### Local Storage Testing
```typescript
describe('Storage Migrations', () => {
    it('should migrate data from V2 to V3 schema', () => {
        const v2Data: StoredDataV2 = {
            schemaVersion: 2,
            // ... v2 structure
        };

        const migratedData = migrateV2toV3(v2Data);
        
        expect(migratedData.schemaVersion).toBe(3);
        expect(migratedData).toMatchObject(expectedV3Structure);
    });
});
```

#### Complex State Testing
```typescript
describe('MockTable State Logic', () => {
    it('should calculate amount spent correctly', () => {
        const mockCostEstimator = { 
            predict: jest.fn(player => player.suggestedCost) 
        };
        const selectedPlayers = [
            { id: '1', suggestedCost: 20 },
            { id: '2', suggestedCost: 30 },
        ];

        const result = calculateAmountSpent(
            mockCostEstimator, 
            10, 
            selectedPlayers, 
            new Map()
        );

        expect(result).toBe(58); // 20 + 30 + 8 unused spots
    });
});
```

## Test Organization

### File Structure
```
src/
├── ui/
│   ├── Component.tsx
│   ├── Component.test.tsx        # Component tests
│   └── tests/
│       └── LoadingScreen.test.tsx # Complex component tests
├── platforms/
│   ├── sleeper/
│   │   ├── SleeperApi.ts
│   │   └── SleeperApi.test.ts    # API integration tests
│   └── espn/
│       └── tests.ts/
│           └── utils.test.ts     # Platform-specific tests
└── app/
    ├── api/
    │   ├── Decoder.ts
    │   └── Decoder.test.ts       # Utility tests
    └── storage/
        └── savedMockMigrations.test.ts # Migration tests
```

### Naming Conventions
- Test files: `ComponentName.test.tsx` or `utilityName.test.ts`
- Test directories: `tests/` for complex test suites
- Describe blocks: Match the component/function name
- Test cases: Use descriptive "should..." statements

## Testing Commands

### Available Scripts
```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage report
npm test -- --coverage

# Run specific test file
npm test -- ComponentName.test.tsx

# Run tests matching pattern
npm test -- --testNamePattern="should handle user input"

# Run tests for specific directory
npm test -- src/ui/

# Debug tests with Node inspector
npm test -- --inspect-brk
```

### Coverage Configuration
```typescript
// jest.config.ts coverage settings
{
  collectCoverage: true,
  coverageDirectory: "coverage",
  coverageProvider: "v8",
  // Optionally set coverage thresholds
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  }
}
```

## Mocking Strategies

### External APIs
```typescript
// Mock entire API modules
jest.mock('@/platforms/sleeper/api');

// Mock specific functions
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
}));
```

### Next.js Specific Mocking
```typescript
// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/test',
  }),
}));

// Mock dynamic imports
jest.mock('next/dynamic', () => () => {
  const DynamicComponent = () => null;
  DynamicComponent.displayName = 'LoadingComponent';
  return DynamicComponent;
});
```

### Local Storage Mocking
```typescript
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});
```

## Testing Best Practices

### Do's
- **Test behavior, not implementation**: Focus on what the component does, not how
- **Use semantic queries**: Prefer `getByRole`, `getByLabelText` over `getByTestId`
- **Test error states**: Include tests for error handling and edge cases
- **Mock external dependencies**: Keep tests isolated and predictable
- **Use realistic data**: Test with data that resembles production
- **Test accessibility**: Ensure components work with screen readers

### Don'ts
- **Don't test implementation details**: Avoid testing internal state or methods
- **Don't over-mock**: Only mock what's necessary for isolation
- **Don't test third-party libraries**: Focus on your own code
- **Don't use `act()` unnecessarily**: React Testing Library handles most cases
- **Don't ignore async operations**: Always wait for async operations to complete

### Example Best Practices
```typescript
// Good: Test user behavior
it('should submit form when user clicks submit', async () => {
    const user = userEvent.setup();
    const mockSubmit = jest.fn();
    
    render(<Form onSubmit={mockSubmit} />);
    
    await user.type(screen.getByLabelText('Name'), 'John Doe');
    await user.click(screen.getByRole('button', { name: /submit/i }));
    
    expect(mockSubmit).toHaveBeenCalledWith({ name: 'John Doe' });
});

// Bad: Test implementation details
it('should call setState when input changes', () => {
    const wrapper = mount(<Form />);
    wrapper.find('input').simulate('change', { target: { value: 'test' } });
    expect(wrapper.state('inputValue')).toBe('test');
});
```

## Continuous Integration

### GitHub Actions Integration
The project includes CI pipeline (`.github/workflows/ci.yml`) that:
- Runs on Node.js versions 18.18.0, 20.x, 22.x
- Installs dependencies
- Builds the application
- Executes the full test suite

### Local Testing Workflow
1. **Before committing**: Run `npm test` to ensure all tests pass
2. **During development**: Use `npm test -- --watch` for continuous feedback
3. **Before deployment**: Run `npm test -- --coverage` to check coverage
4. **Debugging**: Use `npm test -- --inspect-brk` to debug specific tests

## Performance Testing Considerations

### Component Performance
```typescript
// Test component rendering performance
it('should render large lists efficiently', () => {
    const largeDataSet = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `Item ${i}` }));
    
    const start = performance.now();
    render(<VirtualizedList items={largeDataSet} />);
    const renderTime = performance.now() - start;
    
    expect(renderTime).toBeLessThan(100); // 100ms threshold
});
```

### Memory Leak Testing
```typescript
// Test for memory leaks in components with subscriptions
it('should cleanup subscriptions on unmount', () => {
    const mockUnsubscribe = jest.fn();
    const mockSubscribe = jest.fn(() => mockUnsubscribe);
    
    const { unmount } = render(<SubscribedComponent subscribe={mockSubscribe} />);
    
    expect(mockSubscribe).toHaveBeenCalled();
    
    unmount();
    
    expect(mockUnsubscribe).toHaveBeenCalled();
});
```

## Future Testing Enhancements

### Planned Improvements
1. **E2E Testing**: Add Playwright or Cypress for full user journey testing
2. **Visual Regression**: Add screenshot testing for UI consistency
3. **API Contract Testing**: Add tests to verify external API contracts
4. **Performance Benchmarks**: Add automated performance regression testing
5. **Accessibility Testing**: Add automated a11y testing with jest-axe

### Test Data Management
- **Factories**: Create test data factories for consistent test objects
- **Fixtures**: Use JSON fixtures for complex test scenarios
- **Builders**: Implement builder pattern for flexible test data creation 