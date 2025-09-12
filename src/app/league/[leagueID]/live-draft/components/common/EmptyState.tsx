'use client';

import React from 'react';

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: string;
  children?: React.ReactNode;
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  icon,
  children,
  className = ''
}) => {
  return (
    <div className={`text-center py-8 text-gray-500 dark:text-gray-400 ${className}`}>
      {icon && (
        <div className="text-4xl mb-3">
          {icon}
        </div>
      )}
      <p className="text-lg mb-2">{title}</p>
      {message && (
        <p className="text-sm">{message}</p>
      )}
      {children && (
        <div className="mt-4">
          {children}
        </div>
      )}
    </div>
  );
};

export default EmptyState;