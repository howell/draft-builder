'use client';

import React from 'react';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'primary' | 'neutral';
  className?: string;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  variant = 'neutral',
  className = ''
}) => {
  const getVariantClasses = () => {
    switch (variant) {
      case 'success':
        return 'bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-100';
      case 'warning':
        return 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-900 dark:text-yellow-100';
      case 'error':
        return 'bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-100';
      case 'info':
        return 'bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-100';
      case 'primary':
        return 'bg-primary-50 dark:bg-primary-900/20 text-primary-900 dark:text-primary-100';
      case 'neutral':
        return 'bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100';
    }
  };

  const getValueColor = () => {
    switch (variant) {
      case 'success':
        return 'text-green-600 dark:text-green-400';
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'info':
        return 'text-blue-600 dark:text-blue-400';
      case 'primary':
        return 'text-primary-600 dark:text-primary-400';
      case 'neutral':
        return 'text-gray-900 dark:text-gray-100';
    }
  };

  const getSubtitleColor = () => {
    switch (variant) {
      case 'success':
        return 'text-green-700 dark:text-green-300';
      case 'warning':
        return 'text-yellow-700 dark:text-yellow-300';
      case 'error':
        return 'text-red-700 dark:text-red-300';
      case 'info':
        return 'text-blue-700 dark:text-blue-300';
      case 'primary':
        return 'text-primary-700 dark:text-primary-300';
      case 'neutral':
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className={`p-4 rounded-lg ${getVariantClasses()} ${className}`}>
      <div className="text-sm font-medium mb-1">
        {title}
      </div>
      <div className={`text-xl font-bold ${getValueColor()}`}>
        {value}
      </div>
      {subtitle && (
        <div className={`text-sm ${getSubtitleColor()}`}>
          {subtitle}
        </div>
      )}
    </div>
  );
};

export default StatCard;