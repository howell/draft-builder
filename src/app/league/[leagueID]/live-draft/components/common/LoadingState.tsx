'use client';

import React from 'react';

export interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  size = 'md',
  className = ''
}) => {
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return {
          spinner: 'w-3 h-3 border border-primary-500 border-t-transparent',
          text: 'text-xs',
          gap: 'gap-1'
        };
      case 'md':
        return {
          spinner: 'w-4 h-4 border-2 border-primary-500 border-t-transparent',
          text: 'text-sm',
          gap: 'gap-2'
        };
      case 'lg':
        return {
          spinner: 'w-6 h-6 border-2 border-primary-500 border-t-transparent',
          text: 'text-base',
          gap: 'gap-3'
        };
    }
  };

  const sizeClasses = getSizeClasses();

  return (
    <div className={`flex items-center ${sizeClasses.gap} ${className}`}>
      <div className={`${sizeClasses.spinner} rounded-full animate-spin`} />
      <span className={`text-gray-600 dark:text-gray-400 ${sizeClasses.text}`}>
        {message}
      </span>
    </div>
  );
};

export default LoadingState;