import React from 'react';

export type BadgeVariant = 'primary' | 'accent' | 'secondary' | 'success' | 'warning' | 'error' | 'neutral' | 'info';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  primary: 'bg-primary-100 text-primary-800 dark:bg-primary-900 dark:text-primary-200',
  accent: 'bg-accent-100 text-accent-800 dark:bg-accent-900 dark:text-accent-200',
  secondary: 'bg-secondary-100 text-secondary-800 dark:bg-secondary-900 dark:text-secondary-200',
  success: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
}) => {
  const baseClasses = 'inline-flex items-center rounded-full font-medium';
  
  const classes = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes}>
      {children}
    </span>
  );
};

// Position Badge Component for player positions
export const PositionBadge: React.FC<{ position: string; className?: string }> = ({ 
  position, 
  className = '' 
}) => {
  const positionVariants: Record<string, string> = {
    QB: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    RB: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    WR: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    TE: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    FLEX: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    K: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    DEF: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    DST: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  };

  const variantClass = positionVariants[position.toUpperCase()] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${variantClass} ${className}`}>
      {position}
    </span>
  );
};

export default Badge;