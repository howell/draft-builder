# Frontend Components Guide

## Overview
Draft Builder is built with Next.js 15 and React 19, using a component-based architecture with TypeScript. The application emphasizes reusable UI components, consistent styling with Tailwind CSS, and robust loading/error state management.

## Architecture Principles

### Component Design Philosophy
- **Reusability**: Components are designed for maximum reuse across different contexts
- **Type Safety**: Strong TypeScript typing throughout all components
- **Composition**: Complex UI built through component composition rather than inheritance
- **Separation of Concerns**: Clear separation between UI logic and business logic

### State Management Approach
- **Local State**: React's `useState` for component-specific state
- **Effect Management**: `useEffect` for side effects and data fetching
- **Props Flow**: Unidirectional data flow through props
- **Client Storage**: localStorage for persistent user preferences

## Core UI Components

### 1. LoadingScreen Component
**Location**: `src/ui/LoadingScreen.tsx`
**Purpose**: Manages asynchronous operations with user-friendly loading states

```typescript
interface LoadingScreenProps {
    tasks?: LoadingTasks;
    children?: React.ReactNode;
}

export class LoadingTask {
    constructor(task: TaskStatusChecker, message: string);
    public isFinished(): boolean;
    public setup(finishTask: (task: LoadingTask) => void): void;
}
```

**Key Features**:
- **Task-Based Loading**: Manages multiple concurrent async operations
- **Progressive Messages**: Shows current operation status to user
- **Promise Integration**: Seamlessly handles Promise-based tasks
- **Conditional Rendering**: Hides/shows children based on loading state

**Usage Pattern**:
```typescript
const [loadingTasks, setLoadingTasks] = useState<LoadingTasks>(new Set());

// Add a loading task
const request = client.fetchLeague();
setLoadingTasks(new Set([new LoadingTask(request, 'Fetching League')]));

// Render with loading
return (
    <LoadingScreen tasks={loadingTasks}>
        <MainContent />
    </LoadingScreen>
);
```

### 2. Sidebar Component
**Location**: `src/ui/Sidebar.tsx`
**Purpose**: Navigation and league selection interface

```typescript
interface SidebarProps {
    leagueID?: LeagueId;
    availableLeagues?: PlatformLeague[];
    children?: React.ReactNode;
}
```

**Key Features**:
- **Collapsible Design**: Toggleable open/closed states
- **League Switching**: Dropdown for selecting between available leagues
- **Platform Icons**: Visual platform identification (ESPN/Sleeper)
- **Responsive Layout**: Adapts to desktop/mobile viewports

**Navigation Integration**:
- Uses Next.js `useRouter` for programmatic navigation
- Integrates with `activateLeague()` utility for league switching
- Maintains league state in localStorage

### 3. Tooltip Component
**Location**: `src/ui/Tooltip.tsx`
**Purpose**: Contextual help and information display

```typescript
interface TooltipProps {
    children: ReactNode;
    text: string;
}
```

**Key Features**:
- **Portal Rendering**: Uses `createPortal` for proper z-index layering
- **Smart Positioning**: Calculates optimal tooltip placement
- **Touch Support**: Works on both desktop and mobile devices
- **Timing Control**: Configurable show/hide delays

**Advanced Positioning**:
- Viewport-aware positioning to prevent tooltips from going off-screen
- Automatic repositioning based on available space
- Collision detection with screen boundaries

### 4. TabContainer Component
**Location**: `src/ui/TabContainer.tsx`
**Purpose**: Tabbed interface for organizing related content

```typescript
export type TabTitle = React.ReactNode | ((selected: boolean) => React.ReactNode);

export type TabChild = {
    title: TabTitle;
    content: React.ReactNode | string;
}
```

**Key Features**:
- **Dynamic Titles**: Tab titles can be functions that adapt to selection state
- **Flexible Content**: Supports any React content in tab panels
- **State Management**: Internal state for active tab selection

### 5. DropdownMenu Component
**Location**: `src/ui/DropdownMenu.tsx`
**Purpose**: Selectable dropdown interface

**Key Features**:
- **Generic Options**: Supports any data type through generic typing
- **Custom Rendering**: Option names can be React components
- **Selection Callbacks**: Provides both name and value on selection

### 6. ErrorScreen Component
**Location**: `src/ui/ErrorScreen.tsx`
**Purpose**: Standardized error display

**Features**:
- Consistent error messaging across the application
- Simple, clean error presentation
- Integrates with loading states

## Page-Level Components

### 1. Home Page (`src/app/page.tsx`)
**Purpose**: Main landing page with platform login options

**Key Features**:
- **Platform Selection**: Tabbed interface for ESPN/Sleeper login
- **League Management**: Displays previously connected leagues
- **Demo Mode**: Link to demo functionality

**Component Composition**:
```typescript
<LoadingScreen tasks={loadingTasks}>
    <main>
        <Sidebar availableLeagues={availableLeagues} />
        <TabContainer pages={[
            { title: headerFor('espn'), content: <EspnLogin /> },
            { title: headerFor('sleeper'), content: <SleeperLogin /> },
        ]} />
    </main>
</LoadingScreen>
```

### 2. League Page (`src/app/league/[leagueID]/page.tsx`)
**Purpose**: Main league dashboard after authentication

**Data Flow**:
1. Extract league ID from URL parameters
2. Load league configuration from localStorage
3. Fetch league data via API client
4. Display league information with navigation

**Error Handling**:
- Invalid league ID validation
- League loading error states
- API failure handling

## Platform-Specific Components

### 1. EspnLogin Component
**Location**: `src/app/EspnLogin.tsx`
**Purpose**: ESPN-specific authentication interface

**Features**:
- Cookie-based authentication for private leagues
- Public league support
- Form validation and error handling

### 2. SleeperLogin Component
**Location**: `src/app/SleeperLogin.tsx`
**Purpose**: Sleeper platform authentication

**Features**:
- Simple league ID input
- No authentication required for most leagues
- Instant validation

## Styling and Design System

### Tailwind CSS Integration
- **Utility-First**: All styling through Tailwind utility classes
- **Responsive Design**: Mobile-first responsive breakpoints
- **Dark Mode**: Prepared for dark mode support
- **Consistent Spacing**: Standardized margin/padding scale

### Color Scheme
- **Primary**: Blue tones for active states and highlights
- **Secondary**: Gray scale for backgrounds and neutral elements
- **Accent**: Red for close/delete actions
- **Text**: High contrast for accessibility

### Common Class Patterns
```css
/* Loading states */
.animate-spin
.bg-opacity-90

/* Interactive elements */
.cursor-pointer
.hover:bg-gray-100

/* Layout */
.flex flex-col
.items-center justify-center
.min-h-screen

/* Responsive */
.md:ml-44
.w-full md:w-auto
```

## State Management Patterns

### Local Component State
```typescript
const [isVisible, setIsVisible] = useState(false);
const [position, setPosition] = useState<{ top: number, left: number } | null>(null);
```

### Effect Patterns
```typescript
// Cleanup pattern
useEffect(() => {
    return () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
}, []);

// Data fetching pattern
useEffect(() => {
    const fetchData = async () => {
        try {
            const response = await apiCall();
            setData(response);
        } catch (error) {
            setError(error.message);
        } finally {
            setLoading(false);
        }
    };
    fetchData();
}, [dependency]);
```

### Ref Patterns
```typescript
const elementRef = useRef<HTMLDivElement>(null);
const timeoutRef = useRef<NodeJS.Timeout | null>(null);
```

## Event Handling Patterns

### Mouse and Touch Events
```typescript
const handleInteraction = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    // Handle both mouse and touch
};

onMouseEnter={showTooltip}
onTouchStart={showTooltip}
```

### Form Handling
```typescript
const handleSubmit: LeagueSubmitCallback = useCallback(async (league: PlatformLeague) => {
    if (submissionInProgress) return;
    try {
        setSubmissionInProgress(true);
        await submitLeague(league);
    } finally {
        setSubmissionInProgress(false);
    }
}, [submissionInProgress]);
```

## Component Testing Strategy

### Testing Utilities
- **Testing Library**: React Testing Library for component testing
- **Jest**: Unit testing framework
- **User Events**: Simulating user interactions

### Example Test Pattern
```typescript
// From Tooltip.test.tsx
test('shows tooltip on hover after delay', async () => {
    render(<Tooltip text="Test tooltip">Hover me</Tooltip>);
    
    const trigger = screen.getByRole('tooltip-trigger');
    fireEvent.mouseEnter(trigger);
    
    await waitFor(() => {
        expect(screen.getByText('Test tooltip')).toBeInTheDocument();
    });
});
```

## Performance Considerations

### React Optimization
- **useCallback**: Memoizing event handlers to prevent unnecessary re-renders
- **useMemo**: Expensive calculations cached
- **Component Splitting**: Large components split for better tree shaking

### Bundle Optimization
- **Dynamic Imports**: Code splitting for route-based components
- **Tree Shaking**: Unused code elimination
- **Image Optimization**: Next.js Image component for optimized loading

### Loading Strategies
- **Progressive Loading**: Show UI while data loads
- **Optimistic Updates**: Update UI before API confirmation
- **Error Boundaries**: Graceful error handling

## Accessibility Features

### ARIA Support
- **aria-label**: Descriptive labels for interactive elements
- **role**: Semantic roles for screen readers
- **aria-expanded**: State information for collapsible elements

### Keyboard Navigation
- **Tab Order**: Logical tab sequence through interactive elements
- **Enter/Space**: Activation support for custom buttons
- **Escape**: Close modals and dropdowns

### Visual Accessibility
- **High Contrast**: Sufficient color contrast ratios
- **Focus Indicators**: Clear focus states for keyboard navigation
- **Text Scaling**: Responsive text sizing

## Future Component Enhancements

### Planned Components
- **DataTable**: Sortable, filterable data display
- **Modal**: Overlay dialog system
- **Form Components**: Standardized form inputs
- **Chart Components**: Data visualization components

### Architecture Improvements
- **Component Library**: Extracted reusable component package
- **Design Tokens**: Centralized design system values
- **Animation System**: Consistent transitions and animations
- **Testing Framework**: Enhanced component testing utilities

## Development Guidelines

### Component Creation Checklist
1. **TypeScript Interface**: Define clear prop types
2. **Default Props**: Provide sensible defaults
3. **Error Handling**: Handle edge cases gracefully
4. **Accessibility**: Include ARIA attributes
5. **Documentation**: JSDoc comments for complex components
6. **Testing**: Write comprehensive tests

### Naming Conventions
- **Components**: PascalCase (e.g., `LoadingScreen`)
- **Props**: camelCase (e.g., `isVisible`)
- **Event Handlers**: `handle` prefix (e.g., `handleClick`)
- **Custom Hooks**: `use` prefix (e.g., `useApiClient`)

### File Organization
```
src/ui/                 # Reusable UI components
src/app/               # Page-specific components
src/app/api/           # API-related components
components/            # Feature-specific components
``` 