import React from 'react';
import { Card } from './Card';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: {
    value: number;
    isPositive: boolean;
  };
  icon?: React.ReactNode;
  variant?: 'default' | 'primary' | 'accent' | 'secondary';
  className?: string;
}

const variantStyles = {
  default: 'from-gray-50 to-gray-100 border-gray-200 text-gray-900',
  primary: 'from-primary-50 to-primary-100 border-primary-200 text-primary-900',
  accent: 'from-accent-50 to-accent-100 border-accent-200 text-accent-900',
  secondary: 'from-secondary-50 to-secondary-100 border-secondary-200 text-secondary-900',
};

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  icon,
  variant = 'default',
  className = '',
}) => {
  return (
    <Card className={`bg-gradient-to-br ${variantStyles[variant]} border ${className}`} hover>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-semibold opacity-80">{title}</p>
          <p className="text-3xl font-bold mt-1">{value}</p>
          {change && (
            <div className="flex items-center mt-2">
              <span className={`text-sm font-medium ${change.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {change.isPositive ? '↑' : '↓'} {Math.abs(change.value)}%
              </span>
            </div>
          )}
        </div>
        {icon && (
          <div className="text-3xl opacity-70">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
};

export default StatCard;