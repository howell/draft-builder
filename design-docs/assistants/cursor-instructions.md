# Cursor IDE Configuration for Draft Builder

## Project-Specific Instructions

This document provides Cursor IDE with project-specific coding standards, patterns, and conventions for the Draft Builder fantasy sports application. These instructions should be used in conjunction with Cursor's AI assistance to maintain consistency and follow established patterns.

## Documentation and Design Resources

**For AI Programming Assistants**: Before beginning work on this project, consult the following directories for comprehensive project context:

### Design Documentation Structure
```
design-docs/
├── assistants/           # AI-specific guidance and instructions
│   ├── cursor-instructions.md  # This file - coding standards and patterns
│   └── ...              # Additional AI assistant resources
├── architecture/        # System design and technical architecture
├── features/           # Feature specifications and requirements
├── api/               # API design and integration patterns
└── ...                # Additional high-level design documents
```

### Key Information Sources

**High-Level Project Information**:
- `design-docs/` - Contains architectural decisions, feature specifications, and design rationale
- Review architecture documents before making structural changes
- Check feature documentation to understand user requirements and acceptance criteria

**AI Assistant Resources**:
- `design-docs/assistants/` - Specialized guidance for AI programming tools
- Contains prompt templates, coding patterns, and assistant-specific instructions
- Reference these documents when unclear about project conventions or patterns

**Before Starting Development**:
1. **Read** relevant design documents in `design-docs/` for project context
2. **Check** `design-docs/assistants/` for AI-specific guidance and examples
3. **Follow** the established patterns documented in this file
4. **Consult** existing code examples that follow these conventions

This approach ensures consistency with project vision and maintains alignment with established architectural decisions.

## Technology Stack Context

**Framework**: Next.js 15.3.3 with App Router
**Language**: TypeScript with strict mode enabled
**UI**: React 19.1.0 with Tailwind CSS 3.4.1
**Testing**: Jest 29.7.0 with React Testing Library
**State Management**: React hooks and local storage
**API Integration**: Custom platform adapters for ESPN and Sleeper
**Caching**: Redis with ioredis client
**Deployment**: Vercel

## File Organization Standards

### Directory Structure
```
src/
├── app/                    # Next.js App Router pages and API routes
│   ├── api/               # Server-side API endpoints
│   ├── league/[leagueID]/ # Dynamic league-specific routes
│   └── storage/           # Client-side data persistence
├── platforms/             # External platform integrations
│   ├── espn/             # ESPN API wrapper
│   ├── sleeper/          # Sleeper API wrapper
│   └── common.ts         # Shared platform types
├── rankings/             # Player ranking systems
├── redis/                # Redis caching utilities
└── ui/                   # Reusable UI components
```

### Naming Conventions

**Files**:
- Use PascalCase for React components: `MockDraft.tsx`
- Use camelCase for utilities and APIs: `sleeperApi.ts`
- Use kebab-case for page routes: `[league-id]/page.tsx`
- Test files: `ComponentName.test.tsx`

**Variables and Functions**:
- camelCase for variables and functions: `calculateBudget()`
- PascalCase for React components: `<LoadingScreen />`
- UPPER_SNAKE_CASE for constants: `IN_PROGRESS_SELECTIONS_KEY`

**Types and Interfaces**:
- PascalCase with descriptive names: `LeagueInfo`, `MockPlayer`
- Suffix with 'State' for state objects: `SearchSettingsState`
- Use union types for platform distinctions: `Platform = 'sleeper' | 'espn'`

## Code Style Guidelines

### TypeScript Patterns

**Type Safety**:
```typescript
// Always use strict typing
interface Player {
    id: string;              // Use string IDs for consistency
    name: string;
    defaultPosition: string;
    positions: string[];
    suggestedCost?: number;  // Optional properties with ?
}

// Use type guards for runtime checking
function isValidPlayer(obj: any): obj is Player {
    return obj && 
           typeof obj.id === 'string' && 
           typeof obj.name === 'string';
}
```

**Error Handling**:
```typescript
// Platform APIs return data or HTTP error codes
async function fetchData(): Promise<PlayerData | number> {
    try {
        const response = await api.call();
        return response.data;
    } catch (error) {
        logRequestError("Failed to fetch player data", error);
        return 500; // Return HTTP status code
    }
}
```

**Async Patterns**:
```typescript
// Use proper loading states with useCallback
const handleSubmit = useCallback(async (data: FormData) => {
    if (isSubmitting) return;
    
    try {
        setIsSubmitting(true);
        await submitData(data);
    } finally {
        setIsSubmitting(false);
    }
}, [isSubmitting]);
```

### React Component Patterns

**Component Structure**:
```typescript
// Props interface first
interface ComponentProps {
    required: string;
    optional?: boolean;
    children?: React.ReactNode;
}

// Component with proper typing
export default function Component({ required, optional = false }: ComponentProps) {
    // Hooks at the top
    const [state, setState] = useState<StateType>(initialValue);
    const memoizedValue = useMemo(() => expensiveCalculation(), [deps]);
    
    // Event handlers with useCallback
    const handleEvent = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        // Handle event
    }, [dependencies]);
    
    // Render
    return (
        <div className="tailwind-classes">
            {/* JSX content */}
        </div>
    );
}
```

**Loading States**:
```typescript
// Use LoadingTask pattern for complex loading
const tasks = useMemo(() => new Set([
    new LoadingTask(dataPromise, "Loading player data..."),
    new LoadingTask(() => isReady, "Preparing interface...")
]), [dataPromise, isReady]);

return (
    <LoadingScreen tasks={tasks}>
        <MainContent />
    </LoadingScreen>
);
```

### API Integration Patterns

**Platform API Structure**:
```typescript
// Extend PlatformApi base class
export class SleeperApi extends PlatformApi {
    async fetchLeague(season?: SeasonId): Promise<LeagueInfo | number> {
        try {
            const response = await fetchLeagueInfo(this.league.id);
            return importSleeperLeagueInfo(response);
        } catch (error) {
            return this.handleError(error);
        }
    }
}

// Use factory pattern for API selection
export function apiFor(league: PlatformLeague): PlatformApi {
    switch (league.platform) {
        case 'sleeper': return new SleeperApi(league);
        case 'espn': return new EspnApi(league);
        default: throw new Error(`Unsupported platform: ${league.platform}`);
    }
}
```

### Testing Standards

**Test File Structure**:
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ComponentName from './ComponentName';

describe('ComponentName', () => {
    // Setup/teardown if needed
    beforeEach(() => {
        // Reset mocks
    });

    it('should render with required props', () => {
        render(<ComponentName required="value" />);
        expect(screen.getByText('expected')).toBeInTheDocument();
    });

    it('should handle user interactions', async () => {
        const user = userEvent.setup();
        const mockCallback = jest.fn();
        
        render(<ComponentName onAction={mockCallback} />);
        
        await user.click(screen.getByRole('button'));
        
        expect(mockCallback).toHaveBeenCalledWith(expectedArgs);
    });
});
```

**Mock Patterns**:
```typescript
// Mock external dependencies
jest.mock('./api', () => ({
    fetchData: jest.fn(),
}));

// Type-safe mocks
const mockFetchData = fetchData as jest.MockedFunction<typeof fetchData>;

beforeEach(() => {
    mockFetchData.mockReset();
});
```

## Common Anti-Patterns to Avoid

**Don't**:
- Use `any` type except in very specific cases
- Mutate props or state directly
- Create components inside render functions
- Use string refs (use useRef hook)
- Ignore error boundaries
- Use index as key in dynamic lists
- Mix platform-specific logic in shared components

**Do**:
- Use strict TypeScript typing
- Implement proper error boundaries
- Use React.memo for expensive pure components
- Implement proper loading and error states
- Use useCallback for event handlers in optimized components
- Follow the established platform abstraction patterns

## Performance Guidelines

**Optimization Patterns**:
```typescript
// Memoize expensive calculations
const expensiveValue = useMemo(() => {
    return complexCalculation(data);
}, [data]);

// Memoize components that receive complex props
const MemoizedComponent = React.memo(Component, (prevProps, nextProps) => {
    return prevProps.complexProp.id === nextProps.complexProp.id;
});

// Use dynamic imports for code splitting
const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
    loading: () => <LoadingSpinner />,
});
```

## Error Handling Standards

**Client-Side Errors**:
```typescript
// Use error boundaries for component errors
<ErrorBoundary fallback={<ErrorScreen />}>
    <RiskyComponent />
</ErrorBoundary>

// Handle async errors gracefully
const [error, setError] = useState<string | null>(null);

try {
    await riskyOperation();
} catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error');
}
```

**API Error Handling**:
```typescript
// Consistent error logging
export function logRequestError(message: string, error: any): void {
    console.error("Error with", message);
    console.error("Error type:", typeof error);
    console.error("Error details:", JSON.stringify(error).substring(0, 500));
}
```

## State Management Patterns

**Local Storage Integration**:
```typescript
// Use type-safe local storage hooks
const [storedData, setStoredData] = useLocalStorage<DataType>('key', defaultValue);

// Handle storage migrations
const migratedData = migrate(rawStorageData);
```

**Form State Management**:
```typescript
// Use controlled components with proper validation
const [formData, setFormData] = useState<FormType>(initialForm);

const handleInputChange = (field: keyof FormType) => (value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
};
```

## Accessibility Requirements

**Always Include**:
- Proper ARIA labels: `aria-label`, `aria-describedby`
- Semantic HTML roles: `role="button"`, `role="tooltip"`
- Keyboard navigation support
- Screen reader compatible text
- Color contrast compliance
- Focus management for dynamic content

## Code Review Checklist

Before submitting code, ensure:
- [ ] All TypeScript errors resolved
- [ ] Tests pass and have adequate coverage
- [ ] Error handling implemented
- [ ] Loading states provided
- [ ] Accessibility attributes included
- [ ] Performance considerations addressed
- [ ] Follows established patterns
- [ ] No console.log statements in production code
- [ ] Proper error logging used

## Import Organization

**Order**:
1. React and Next.js imports
2. Third-party libraries
3. Internal utilities and types
4. Relative imports
5. Type-only imports at the end

```typescript
import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

import { apiFor } from '@/platforms/ApiClient';
import { LoadingScreen } from '@/ui/LoadingScreen';
import { logRequestError } from '@/utils/errors';

import './Component.module.css';

import type { PlatformLeague } from '@/platforms/common';
``` 