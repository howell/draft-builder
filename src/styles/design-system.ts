/**
 * Draft Builder Design System
 * Consistent design tokens for a fantasy football analytics application
 */

// Core Colors - Fantasy football inspired palette
export const colors = {
  // Primary - Professional blue for data/analytics
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6', // Main primary
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
  },
  
  // Accent - Field green for fantasy football theme
  accent: {
    50: '#f0fdf4',
    100: '#dcfce7',
    200: '#bbf7d0',
    300: '#86efac',
    400: '#4ade80',
    500: '#22c55e', // Main accent
    600: '#16a34a',
    700: '#15803d',
    800: '#166534',
    900: '#14532d',
  },
  
  // Secondary - Purple for premium/advanced features
  secondary: {
    50: '#faf5ff',
    100: '#f3e8ff',
    200: '#e9d5ff',
    300: '#d8b4fe',
    400: '#c084fc',
    500: '#a855f7', // Main secondary
    600: '#9333ea',
    700: '#7e22ce',
    800: '#6b21a8',
    900: '#581c87',
  },
  
  // Neutral grays
  gray: {
    50: '#f9fafb',
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
  
  // Semantic colors
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
};

// Typography scale
export const typography = {
  fontSize: {
    xs: '0.75rem',     // 12px
    sm: '0.875rem',    // 14px
    base: '1rem',      // 16px
    lg: '1.125rem',    // 18px
    xl: '1.25rem',     // 20px
    '2xl': '1.5rem',   // 24px
    '3xl': '1.875rem', // 30px
    '4xl': '2.25rem',  // 36px
    '5xl': '3rem',     // 48px
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
    relaxed: 1.75,
  },
};

// Spacing scale
export const spacing = {
  0: '0',
  1: '0.25rem',  // 4px
  2: '0.5rem',   // 8px
  3: '0.75rem',  // 12px
  4: '1rem',     // 16px
  5: '1.25rem',  // 20px
  6: '1.5rem',   // 24px
  8: '2rem',     // 32px
  10: '2.5rem',  // 40px
  12: '3rem',    // 48px
  16: '4rem',    // 64px
  20: '5rem',    // 80px
};

// Border radius
export const borderRadius = {
  none: '0',
  sm: '0.125rem',   // 2px
  base: '0.25rem',  // 4px
  md: '0.375rem',   // 6px
  lg: '0.5rem',     // 8px
  xl: '0.75rem',    // 12px
  '2xl': '1rem',    // 16px
  full: '9999px',
};

// Shadows
export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  base: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
};

// Component styles
export const components = {
  button: {
    base: 'font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
    sizes: {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2 text-base',
      lg: 'px-6 py-3 text-lg',
    },
    variants: {
      primary: `bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500`,
      secondary: `bg-secondary-600 text-white hover:bg-secondary-700 focus:ring-secondary-500`,
      accent: `bg-accent-600 text-white hover:bg-accent-700 focus:ring-accent-500`,
      ghost: `bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-500`,
      outline: `border-2 border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-500`,
    },
  },
  
  input: {
    base: 'w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:bg-gray-50 disabled:text-gray-500',
    error: 'border-red-300 focus:ring-red-500 focus:border-red-500',
  },
  
  card: {
    base: 'bg-white rounded-xl shadow-md',
    padding: {
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    },
    hover: 'hover:shadow-lg transition-shadow duration-200',
  },
  
  badge: {
    base: 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
    variants: {
      primary: 'bg-primary-100 text-primary-800',
      accent: 'bg-accent-100 text-accent-800',
      secondary: 'bg-secondary-100 text-secondary-800',
      success: 'bg-green-100 text-green-800',
      warning: 'bg-yellow-100 text-yellow-800',
      error: 'bg-red-100 text-red-800',
    },
  },
  
  table: {
    container: 'overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg',
    header: 'bg-gray-50',
    headerCell: 'px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider',
    row: 'bg-white hover:bg-gray-50 transition-colors',
    cell: 'px-6 py-4 whitespace-nowrap text-sm text-gray-900',
  },
};

// Animations
export const animations = {
  spin: 'animate-spin',
  pulse: 'animate-pulse',
  fadeIn: 'transition-opacity duration-300 ease-in',
  slideIn: 'transition-transform duration-300 ease-out',
};

// Tailwind class helpers
export const tw = {
  // Button classes
  buttonPrimary: 'bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed',
  buttonSecondary: 'bg-secondary-600 hover:bg-secondary-700 text-white font-medium py-2 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary-500 disabled:opacity-50 disabled:cursor-not-allowed',
  buttonAccent: 'bg-accent-600 hover:bg-accent-700 text-white font-medium py-2 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-500 disabled:opacity-50 disabled:cursor-not-allowed',
  buttonGhost: 'bg-transparent hover:bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500',
  
  // Input classes
  input: 'w-full px-4 py-2 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors',
  inputError: 'w-full px-4 py-2 border border-red-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500',
  
  // Card classes
  card: 'bg-white rounded-xl shadow-md p-6',
  cardHover: 'bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow',
  
  // Text classes
  heading1: 'text-4xl font-bold text-gray-900',
  heading2: 'text-3xl font-bold text-gray-900',
  heading3: 'text-2xl font-semibold text-gray-900',
  heading4: 'text-xl font-semibold text-gray-900',
  bodyText: 'text-base text-gray-700',
  smallText: 'text-sm text-gray-600',
  
  // Layout classes
  container: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',
  section: 'py-12',
};

// Fantasy football specific styles
export const fantasyTheme = {
  statCard: 'bg-gradient-to-br from-accent-50 to-accent-100 rounded-xl p-4 border border-accent-200',
  playerCard: 'bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow p-4 border-l-4 border-primary-600',
  draftBoard: 'bg-gradient-to-b from-gray-50 to-white rounded-xl shadow-lg',
  
  // Position colors matching Sleeper's color scheme
  positionColors: {
    QB: '#dc2626',    // red-600
    RB: '#16a34a',    // green-600  
    WR: '#2563eb',    // blue-600
    TE: '#ea580c',    // orange-600
    FLEX: '#9333ea',  // purple-600
    K: '#9333ea',     // purple-600 (light purple)
    DEF: '#d97706',   // amber-600 (light brown)
    DST: '#d97706',   // amber-600 (light brown)
  } as const,
};

// Helper function to get position color for charts
export const getPositionColor = (position: string): string => {
  const upperPos = position.toUpperCase() as keyof typeof fantasyTheme.positionColors;
  return fantasyTheme.positionColors[upperPos] || '#6b7280'; // gray-500 default
};

// Helper function to get Tailwind classes for position badges
export const getPositionBadgeClasses = (position: string): string => {
  const positionClassMap: Record<string, string> = {
    QB: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    RB: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    WR: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    TE: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    FLEX: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    K: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    DEF: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    DST: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  };
  
  return positionClassMap[position.toUpperCase()] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
};