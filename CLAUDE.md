# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This repository holds the source code for the web application **Draft Builder** (know-your-league.com) — a fantasy football auction draft prep tool.

## Development Commands

### Core Development
- `npm run dev` - Start development server with Supabase (runs `supabase start` first)
- `npm run dev:db` - Start only Supabase database
- `npm run dev:stop` - Stop Supabase database
- `npm run dev:reset` - Reset Supabase database to clean state

> **IMPORTANT**: Docker must be running before `npm run dev` — local Supabase is Docker-based.

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
- **Data Fetching**: TanStack React Query v5 (`@tanstack/react-query`) — primary fetch/cache layer
- **Testing**: Jest with React Testing Library; Playwright for E2E
- **Caching**: Redis with ioredis client
- **Platform APIs**: ESPN and Sleeper fantasy sports platforms

### Project Structure
```
src/
├── app/                    # Next.js App Router - pages and API routes
├── components/            # React components (auth, UI)
├── hooks/queries/         # React Query hooks (useLeaguesQuery, useSaveLeagueMutation, etc.)
├── lib/                   # Core utilities and services
│   ├── auth/             # Authentication context and hooks (AuthProvider, useAuth)
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

### Data Fetching Architecture

**React Query** (`src/hooks/queries/`) is the primary data-fetching layer. All fetches go through these hooks — do not call `fetch` or storage adapters directly in components.

```typescript
// ✅ CORRECT: Use React Query hooks
const leaguesQuery = useLeaguesQuery();
const saveLeagueMutation = useSaveLeagueMutation();

// ❌ WRONG: Calling storage directly in components
const leagues = await storageAdapter.loadLeagues();
```

Available hooks: `useLeaguesQuery`, `useLeagueQuery`, `useLeagueFromStorage`, `useSaveLeagueMutation`, `useSaveRosterMutation`, `useUserDraftsQuery`, `useDraftHistoryQuery`, `useApiClientQuery`, `useRankingsQuery`.

### Storage Architecture

The application uses a **storage abstraction layer** that supports multiple backends:

- **Interface**: `StorageAdapter` in `src/lib/storage/interface.ts`
- **Dexie**: IndexedDB-based storage for anonymous users and fallback scenarios
- **Supabase**: Production async storage with RLS; ESPN auth is encrypted server-side
- **Memory**: Temporary storage for testing and SSR protection
- **LocalStorage adapter**: DEPRECATED — still present but not used in production paths

**Storage adapter selection** is centralized in `AuthProvider` (`src/lib/auth/context.tsx`), NOT in the factory:
- Server-side → `MemoryStorageAdapter`
- Authenticated user → `SupabaseStorageAdapter` with Dexie fallback
- Anonymous / loading → `DexieStorageAdapter('anonymous')`

Access the adapter via `useStorageAdapter()` hook or `useAuth().storageAdapter`.

**League saves use a different code path**: Authenticated league saves (which may include ESPN cookies) go through `/api/save-league` and `/api/load-leagues` (server routes using the service-role client and `ENCRYPTION_KEY`). All other data types (mocks, rosters, drafts) use the client-side `SupabaseStorageAdapter` directly via React Query hooks, relying on RLS.

**Key rules**:
- Never add `NEXT_PUBLIC_` prefix to `SUPABASE_SERVICE_ROLE_KEY` or `ENCRYPTION_KEY` — these are server-only
- `src/lib/encryption/utils.ts` throws if called in the browser (server-only guard)
- Do not bypass the auth-aware adapter with `getDefaultStorageAdapter()` — that function is not auth-aware

### Platform Integration Architecture
External fantasy platforms are abstracted through a common interface in `src/platforms/`.

### Authentication & Security
- **Authentication**: Supabase Auth with React Context (`useAuth()`)
- **RLS**: All 10 database tables have Row Level Security enabled (`auth.uid() = user_id`)
- **Data migration**: On signup, `MigrationGate` (`src/components/auth/MigrationGate.tsx`) detects existing Dexie data and redirects to `/migrate`, which runs `DataMigrationService` to copy data to Supabase

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

#### Authentication-Aware Storage
The `storageAdapter` lives on the auth context — don't create one manually:

```typescript
// ✅ CORRECT: Get auth-aware adapter from context
const { storageAdapter } = useAuth();
// or
const storageAdapter = useStorageAdapter();
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

### **E2E Testing Key Rules**

- Use `act()` when rendering components with async `useEffect` initialization
- Use `waitFor` only for DOM queries that need to settle — not for mock function assertions
- Mock Supabase auth by setting `(supabase as any).auth = mockSupabaseAuth` with `getSession`, `signUp`, and `onAuthStateChange` methods
- Test user-visible behavior, not internal state or log output
- Do not assert on `console.log` output in tests — those assertions are brittle and should be removed

## Feature Status

### Active branch: `setup_db`
This branch contains significant storage/auth work that is production-ready but not yet merged to `main`.

### Deferred feature: Live Draft
The live-draft feature (`src/app/league/[leagueID]/live-draft/`) is fully implemented (model, hooks, components, storage types) but intentionally unreachable — there is no `page.tsx` and no sidebar nav link. It is deferred to post-v1. Do not add a page or nav link until the post-v1 live-draft integration work is planned.

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
