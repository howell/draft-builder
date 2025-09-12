'use client';

import React from 'react';
import { Badge } from '@/ui/Badge';

export interface AlertBoxProps {
  variant: 'success' | 'warning' | 'error' | 'info';
  icon?: string;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const AlertBox: React.FC<AlertBoxProps> = ({
  variant,
  icon,
  title,
  children,
  className = ''
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'success':
        return 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800';
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800';
      case 'info':
        return 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800';
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case 'success':
        return 'text-green-800 dark:text-green-200';
      case 'warning':
        return 'text-yellow-800 dark:text-yellow-200';
      case 'error':
        return 'text-red-800 dark:text-red-200';
      case 'info':
        return 'text-blue-800 dark:text-blue-200';
    }
  };

  return (
    <div className={`p-4 rounded-lg ${getVariantClasses()} ${className}`}>
      {(icon || title) && (
        <div className="flex items-center gap-2 mb-2">
          {icon && (
            <Badge variant={variant} size="sm">
              {icon}
            </Badge>
          )}
          {title && (
            <span className={`font-medium ${getTextColor()}`}>
              {title}
            </span>
          )}
        </div>
      )}
      <div className={`text-sm ${getTextColor()}`}>
        {children}
      </div>
    </div>
  );
};

export default AlertBox;