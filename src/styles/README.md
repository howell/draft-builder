# Draft Builder Design System

## Overview
This design system provides consistent styling and components for the Draft Builder fantasy football application. It uses a cohesive color palette, typography, and component library to ensure a professional and unified user experience.

## Color Palette

### Primary Colors (Professional Blue)
- Used for main actions, links, and data visualization
- `primary-500` (#3b82f6) - Main brand color
- `primary-600` (#2563eb) - Hover states
- `primary-700` (#1d4ed8) - Active states

### Accent Colors (Field Green)
- Fantasy football theme color for highlights and success states
- `accent-500` (#22c55e) - Main accent
- `accent-600` (#16a34a) - Hover states
- `accent-700` (#15803d) - Active states

### Secondary Colors (Premium Purple)
- Used for premium features and special elements
- `secondary-500` (#a855f7) - Main secondary
- `secondary-600` (#9333ea) - Hover states
- `secondary-700` (#7e22ce) - Active states

### Position Colors
Player positions have specific color associations:
- **QB**: Red (`text-red-600 bg-red-100`)
- **RB**: Green (`text-green-600 bg-green-100`)
- **WR**: Blue (`text-blue-600 bg-blue-100`)
- **TE**: Orange (`text-orange-600 bg-orange-100`)
- **FLEX**: Purple (`text-purple-600 bg-purple-100`)
- **K**: Gray (`text-gray-600 bg-gray-100`)
- **DEF/DST**: Indigo (`text-indigo-600 bg-indigo-100`)

## Component Library

### Button
```tsx
import { Button } from '@/ui/Button';

// Primary button
<Button variant="primary">Save Draft</Button>

// Secondary button
<Button variant="secondary">Premium Feature</Button>

// Accent button
<Button variant="accent">Start Draft</Button>

// Ghost button
<Button variant="ghost">Cancel</Button>

// Sizes
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>

// Loading state
<Button loading>Processing...</Button>

// Full width
<Button fullWidth>Create Account</Button>
```

### Input
```tsx
import { Input } from '@/ui/Input';

// Basic input
<Input 
  label="Email Address"
  placeholder="Enter your email"
/>

// With error
<Input 
  label="Password"
  error="Password is required"
/>

// With helper text
<Input 
  label="League ID"
  helperText="Enter your ESPN league ID"
/>
```

### Card
```tsx
import { Card, CardHeader, CardTitle, CardBody, CardFooter } from '@/ui/Card';

// Basic card
<Card>
  <CardHeader>
    <CardTitle>Draft Summary</CardTitle>
  </CardHeader>
  <CardBody>
    Your draft content here
  </CardBody>
  <CardFooter>
    Footer actions
  </CardFooter>
</Card>

// Card with hover effect
<Card hover>
  Interactive card content
</Card>

// Different padding sizes
<Card padding="sm">Small padding</Card>
<Card padding="lg">Large padding</Card>
```

### Badge
```tsx
import { Badge, PositionBadge } from '@/ui/Badge';

// Status badges
<Badge variant="success">Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="error">Expired</Badge>

// Position badges (fantasy football specific)
<PositionBadge position="QB" />
<PositionBadge position="RB" />
<PositionBadge position="WR" />
```

### Alert
```tsx
import { Alert } from '@/ui/Alert';

// Info alert
<Alert variant="info">
  Draft will begin in 5 minutes
</Alert>

// Success alert
<Alert variant="success" title="Draft Saved">
  Your mock draft has been saved successfully
</Alert>

// Warning alert
<Alert variant="warning">
  Your session will expire in 10 minutes
</Alert>

// Error alert with close button
<Alert variant="error" onClose={() => {}}>
  Failed to load player data
</Alert>
```

## Typography

### Headings
```tsx
// Using Tailwind classes from design system
<h1 className="text-4xl font-bold text-gray-900">Main Title</h1>
<h2 className="text-3xl font-bold text-gray-900">Section Title</h2>
<h3 className="text-2xl font-semibold text-gray-900">Subsection</h3>
<h4 className="text-xl font-semibold text-gray-900">Card Title</h4>
```

### Body Text
```tsx
<p className="text-base text-gray-700">Regular body text</p>
<p className="text-sm text-gray-600">Small text or captions</p>
<p className="text-xs text-gray-500">Fine print</p>
```

## Layout Patterns

### Container
```tsx
<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  Your content
</div>
```

### Section Spacing
```tsx
<section className="py-12">
  Section content
</section>
```

### Grid Layouts
```tsx
// Responsive grid
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <Card>Item 1</Card>
  <Card>Item 2</Card>
  <Card>Item 3</Card>
</div>
```

## Fantasy Football Specific Styles

### Player Card
```tsx
<Card className="border-l-4 border-primary-600">
  <div className="flex items-center justify-between">
    <div>
      <h3 className="font-semibold">Patrick Mahomes</h3>
      <PositionBadge position="QB" />
    </div>
    <Badge variant="accent">$45</Badge>
  </div>
</Card>
```

### Draft Board
```tsx
<div className="bg-gradient-to-b from-gray-50 to-white rounded-xl shadow-lg p-6">
  {/* Draft board content */}
</div>
```

### Stat Card
```tsx
<div className="bg-gradient-to-br from-accent-50 to-accent-100 rounded-xl p-4 border border-accent-200">
  <h4 className="text-accent-900 font-semibold">Total Points</h4>
  <p className="text-3xl font-bold text-accent-700">245.6</p>
</div>
```

## Animations

### Fade In
```tsx
<div className="animate-fade-in">
  Content fades in
</div>
```

### Slide In
```tsx
<div className="animate-slide-in">
  Content slides in
</div>
```

### Spin (Loading)
```tsx
<div className="animate-spin">
  <i className="fas fa-spinner" />
</div>
```

## Best Practices

1. **Consistency**: Always use design system components instead of custom styles
2. **Accessibility**: Ensure proper contrast ratios and ARIA labels
3. **Responsive Design**: Test all components on mobile, tablet, and desktop
4. **Performance**: Use Tailwind's purge feature to minimize CSS bundle size
5. **Theme Adherence**: Maintain the fantasy football theme with appropriate colors and imagery

## Migration Guide

### Old Button Style
```tsx
// Before
<button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded">
  Click Me
</button>

// After
<Button variant="primary">Click Me</Button>
```

### Old Input Style
```tsx
// Before
<input className="w-full px-3 py-2 border border-gray-300 rounded-md" />

// After
<Input placeholder="Enter value" />
```

### Old Card Style
```tsx
// Before
<div className="bg-white rounded-lg shadow-md p-6">
  Content
</div>

// After
<Card>Content</Card>
```

## Future Enhancements

- Dark mode support
- Additional animation presets
- More fantasy sports specific components
- Advanced data visualization components
- Accessibility improvements
- Component playground/Storybook