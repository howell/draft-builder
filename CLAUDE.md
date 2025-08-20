# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repository holds the source code for the web application Know Your League, know-your-league.com

## Development Commands

### Core Development
- `npm run dev` - Start development server with Supabase (runs `supabase start` first)
- `npm run dev:db` - Start only Supabase database
- `npm run dev:stop` - Stop Supabase database
- `npm run dev:reset` - Reset Supabase database to clean state

### Development Server Management
- **IMPORTANT**: Always cleanly shut down the development server when finished
- The development server may already be running: check before starting a new one
- If processes become orphaned, find and kill them: `lsof -ti:3000 | xargs kill`
- Check for running Next.js processes: `ps aux | grep next-server`

### E2E Testing with Playwright
- **IMPORTANT**: Always use `PLAYWRIGHT_HTML_OPEN='never' npx playwright test ...` to prevent Playwright from opening a server after tests complete
- This prevents hanging processes and keeps the terminal clean

### Database Operations
- `npm run db:types` - Generate TypeScript types from Supabase schema
- `supabase migration new <name>` - Create new database migration
- `supabase db push` - Push local migrations to remote database

### Build & Quality
- `npm run build` - Build Next.js application for production
- `npm run lint` - Run ESLint on codebase
- `npm run type-check` - Run TypeScript compiler without emitting files
- `npm test` - Run Jest test suite

### **CRITICAL**: Task Completion Checklist
Before marking any development task as complete, you MUST:

1. **Update Design Documents**: 
   - Mark progress in relevant design documents (e.g., `design-docs/features/user-accounts/implementation-tasks.md`)
   - Update task status from "pending" to "in_progress" to "completed" with ✅ checkmarks
   - Document what was actually implemented vs. what was planned
   - Note any deviations or additional work completed

2. **Verify Code Quality**:
   - Run `npm run type-check` to ensure no TypeScript errors
   - Run `npm run lint` to check for code quality issues
   - Run `npm run build` to verify the application builds successfully
   - Address any critical errors before marking tasks complete

3. **Test Implementation**:
   - Verify the implemented functionality works as expected
   - Check that existing functionality is not broken
   - Run relevant tests if available

## Architecture Overview

### Technology Stack
- **Framework**: Next.js 15.3.3 with App Router and React 19.1.0
- **Database**: Supabase (PostgreSQL) with Row Level Security (RLS)
- **Authentication**: Supabase Auth with email/password
- **Styling**: Tailwind CSS 3.4.1 with custom design system
- **Testing**: Jest with React Testing Library
- **Caching**: Redis with ioredis client
- **Platform APIs**: ESPN and Sleeper fantasy sports platforms

### Project Structure
```
src/
├── app/                    # Next.js App Router - pages and API routes
├── components/            # React components (auth, UI)
├── lib/                   # Core utilities and services
│   ├── auth/             # Authentication context and hooks
│   ├── storage/          # Storage abstraction layer
│   └── supabase.ts       # Supabase client configuration
├── platforms/            # External platform integrations
│   ├── espn/            # ESPN API wrapper and types
│   ├── sleeper/         # Sleeper API wrapper and types
│   └── common.ts        # Shared platform interfaces
├── rankings/            # Player ranking and analysis systems
├── redis/               # Redis caching utilities
├── styles/              # Design system and style utilities
│   ├── design-system.ts # Core design tokens (colors, typography, spacing)
│   └── README.md        # Design system documentation
├── types/               # Shared TypeScript type definitions
└── ui/                  # Reusable UI components
    ├── Button.tsx       # Button component with variants
    ├── Input.tsx        # Form input with validation
    ├── Card.tsx         # Container component
    ├── Badge.tsx        # Status and position badges
    ├── Alert.tsx        # Notification component
    └── ...              # Other UI components
```

### Storage Architecture
The application uses a **storage abstraction layer** that supports multiple backends:

- **Interface**: `StorageAdapter` in `src/lib/storage/interface.ts`
- **Dexie**: IndexedDB-based storage for anonymous users and fallback scenarios
- **Supabase**: Production async storage with encryption for sensitive data and RLS
- **LocalStorage**: DEPRECATED synchronous storage wrapped as async for compatibility
- **Memory**: Temporary storage for testing and SSR protection
- **Factory**: `createStorageAdapter()` selects appropriate implementation

**Key Patterns**: 
- All storage operations are async even when using localStorage to maintain consistency
- **Authentication-aware selection**: Storage adapter automatically selected based on user auth state
- **Fallback support**: Authenticated users can fallback to Dexie when Supabase is unavailable
- **Progressive enhancement**: Anonymous users get high-performance Dexie, authenticated users get cloud sync

### Platform Integration Architecture
External fantasy platforms are abstracted through a common interface:

### Authentication & Security
- **Authentication**: Supabase Auth with React Context (`useAuth()`)

#### Loading States
Use `LoadingScreen` component with `LoadingTask` objects for complex loading scenarios:

```typescript
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

#### Authentication-Aware Hooks Pattern
Use hooks that automatically adapt to authentication state:

```typescript
// ✅ CORRECT: Authentication-aware storage selection
export function useStorageAdapter(): StorageAdapter {
  const { user, loading } = useAuth();
  ...
}
```

## Development Guidelines

### Design System & UI Components

The application uses a comprehensive design system for consistent styling:

#### Core Design Tokens (`/src/styles/design-system.ts`)
- **Colors**: Primary (blue), Accent (green), Secondary (purple) palettes
- **Typography**: Consistent font sizes from xs to 5xl
- **Spacing**: Standardized spacing units
- **Shadows**: Elevation system for depth

#### Reusable Components (`/src/ui/`)
All components support both light and dark modes:

1. **Button** - Variants: primary, secondary, accent, ghost, outline
   ```tsx
   <Button variant="primary" size="md">Save</Button>
   ```

2. **Input** - Form inputs with label, error, and helper text
   ```tsx
   <Input label="Email" error="Required field" />
   ```

3. **Card** - Container with header, body, footer sections
   ```tsx
   <Card><CardBody>Content</CardBody></Card>
   ```

4. **Badge** - Status badges and position-specific badges
   ```tsx
   <Badge variant="success">Active</Badge>
   <PositionBadge position="QB" />
   ```

5. **Alert** - Notifications with semantic variants
   ```tsx
   <Alert variant="error">Error message</Alert>
   ```

#### Dark Mode Support
- All components use Tailwind's `dark:` prefix for dark mode styles
- Automatically respects user's system preference
- Consistent color adjustments for proper contrast

#### Style Guidelines
- Use design system components instead of custom styles
- Apply consistent spacing using the spacing scale
- Ensure all interactive elements have proper hover/focus states
- Maintain fantasy football theme with accent colors for relevant features

For detailed component usage, see `/src/styles/README.md`

### **Documentation Management**
- **ALWAYS** update relevant design documents when working on features
- Mark task progress with clear status indicators (✅ COMPLETED, 🔄 IN PROGRESS, ⏳ PENDING)
- Document actual implementation details, not just planned features
- Update acceptance criteria to reflect what was actually built
- Note any architectural decisions or deviations from original plans
- Keep design documents as the single source of truth for feature status


### Testing Requirements
- **Components**: Test loading, error, and success states
- **Authentication**: Test protected and public routes
- **Progressive Enhancement**: Test both anonymous and authenticated user flows
- **Fallback Scenarios**: Test offline behavior and service unavailability
- **Error Recovery**: Test all error scenarios and recovery mechanisms

### Error Handling Patterns
Use structured error handling with proper user feedback

### Accessibility Patterns
Ensure all components are accessible from the start.


### **CRITICAL**: E2E Testing Best Practices

Based on hard-won experience implementing the user accounts E2E test suite, follow these patterns:

#### 1. **Idiomatic React Testing Library Usage**
```typescript
// ✅ CORRECT: Direct DOM assertions
expect(screen.getByText(/Create Draft Builder Account/i)).toBeInTheDocument();
expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();

// ❌ WRONG: Wrapping simple assertions in waitFor
await waitFor(() => {
  expect(screen.getByText(/Some Text/i)).toBeInTheDocument();
});
```

#### 2. **Handling Async useEffect Hooks**
```typescript
// ✅ CORRECT: Use act() for async component initialization
let renderResult: any;
await act(async () => {
  renderResult = render(
    <AuthProvider>
      <ComponentWithAsyncEffects />
    </AuthProvider>
  );
  // Give async useEffect time to complete
  await new Promise(resolve => setTimeout(resolve, 100));
});

// ❌ WRONG: Expecting immediate sync behavior from async effects
render(<Component />);
expect(screen.getByText(/Async Content/i)).toBeInTheDocument(); // May fail
```

#### 3. **Mock Supabase Auth Properly**
```typescript
// ✅ CORRECT: Complete auth mock setup
const mockSupabaseAuth = {
  getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
  signUp: jest.fn(),
  onAuthStateChange: jest.fn((callback) => {
    // Immediately call callback to set auth state to not loading
    callback('INITIAL_SESSION', null);
    return {
      data: { subscription: { unsubscribe: jest.fn() } }
    };
  })
};
(supabase as any).auth = mockSupabaseAuth;
```

#### 4. **Test What Users See, Not Implementation**
```typescript
// ✅ CORRECT: Test user-visible behavior
expect(screen.getByText(/Secure Your Fantasy Data/i)).toBeInTheDocument();
expect(screen.getByRole('button', { name: /Create Account.*Migrate/i })).toBeInTheDocument();

// ✅ ALSO CORRECT: Verify mocks were called (but don't wrap in waitFor)
expect(hasLocalStorageData).toHaveBeenCalled();

// ❌ WRONG: Testing internal state or complex mock call patterns
await waitFor(() => {
  expect(mockFunction).toHaveBeenCalledWith(specificArg);
});
```

#### 5. **Container Errors with waitFor**
The error "Expected container to be an Element, a Document or a DocumentFragment but got Object" happens when:
- Using `waitFor` to check mock function calls instead of DOM queries
- Passing callbacks that don't interact with the DOM to `waitFor`

```typescript
// ✅ CORRECT: Use waitFor only for DOM queries that may take time
await waitFor(() => {
  expect(screen.getByText(/Dynamic Content/i)).toBeInTheDocument();
});

// ❌ WRONG: Using waitFor for mock assertions
await waitFor(() => {
  expect(mockFunction).toHaveBeenCalled(); // Causes container error
});
```

#### 6. **Component Testing Flow**
1. **Setup**: Mock all external dependencies (Supabase, localStorage, etc.)
2. **Render**: Use `act()` if component has async initialization
3. **Assert**: Test DOM content directly, verify mocks separately
4. **Focus**: Test user-visible behavior, not internal implementation



These patterns ensure reliable, maintainable E2E tests that actually reflect user behavior.

## Important Implementation Notes

## Feature Planning Guidelines

When creating implementation plans for new features:

### Task Organization Principles
- **Small & Focused**: Each task should be completable in a single session
- **Logically Related**: Group related changes together (e.g., all storage changes)
- **Testable**: Each task should produce something that can be tested independently
- **Sequential**: Tasks should build on each other with clear dependencies
- **Rollback Safe**: Each task should leave the system in a working state

### Avoid Time-Based Planning
- **Don't use weeks/sprints**: there is no need to plan based on time
- **Use logical phases**: Organize by functionality, not time
- **Focus on dependencies**: What must be done before what, not when

### Task Size Guidelines
- **Single File Changes**: Prefer tasks that modify 1-3 related files
- **Incremental Testing**: Each task should allow for testing before the next
- **Clear Acceptance Criteria**: Each task should have obvious "done" criteria
- **Atomic Functionality**: Each task should add/modify one coherent piece of functionality