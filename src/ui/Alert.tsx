import React from 'react';

export type AlertVariant = 'info' | 'success' | 'warning' | 'error';

interface AlertProps {
  children: React.ReactNode;
  variant?: AlertVariant;
  title?: string;
  icon?: React.ReactNode;
  onClose?: () => void;
  className?: string;
  'data-testid'?: string;
}

const variantStyles: Record<AlertVariant, {
  container: string;
  icon: string;
  title: string;
  text: string;
  closeButton: string;
  defaultIcon: string;
}> = {
  info: {
    container: 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800',
    icon: 'text-blue-600 dark:text-blue-400',
    title: 'text-blue-800 dark:text-blue-300',
    text: 'text-blue-700 dark:text-blue-400',
    closeButton: 'text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200',
    defaultIcon: 'fa-info-circle',
  },
  success: {
    container: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800',
    icon: 'text-green-600 dark:text-green-400',
    title: 'text-green-800 dark:text-green-300',
    text: 'text-green-700 dark:text-green-400',
    closeButton: 'text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-200',
    defaultIcon: 'fa-check-circle',
  },
  warning: {
    container: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800',
    icon: 'text-yellow-600 dark:text-yellow-400',
    title: 'text-yellow-800 dark:text-yellow-300',
    text: 'text-yellow-700 dark:text-yellow-400',
    closeButton: 'text-yellow-500 hover:text-yellow-700 dark:text-yellow-400 dark:hover:text-yellow-200',
    defaultIcon: 'fa-exclamation-triangle',
  },
  error: {
    container: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800',
    icon: 'text-red-600 dark:text-red-400',
    title: 'text-red-800 dark:text-red-300',
    text: 'text-red-700 dark:text-red-400',
    closeButton: 'text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200',
    defaultIcon: 'fa-exclamation-circle',
  },
};

export const Alert: React.FC<AlertProps> = ({
  children,
  variant = 'info',
  title,
  icon,
  onClose,
  className = '',
  'data-testid': testId,
}) => {
  const styles = variantStyles[variant];
  
  return (
    <div
      className={`rounded-lg border p-4 ${styles.container} ${className}`}
      role="alert"
      data-testid={testId}
    >
      <div className="flex">
        {(icon !== null) && (
          <div className={`flex-shrink-0 ${styles.icon}`}>
            {icon || <i className={`fas ${styles.defaultIcon} text-lg`} />}
          </div>
        )}
        <div className="ml-3 flex-1">
          {title && (
            <h3 className={`text-sm font-medium ${styles.title} mb-1`}>
              {title}
            </h3>
          )}
          <div className={`text-sm ${styles.text}`}>
            {children}
          </div>
        </div>
        {onClose && (
          <div className="ml-auto pl-3">
            <button
              onClick={onClose}
              className={`inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2 ${styles.closeButton}`}
            >
              <span className="sr-only">Dismiss</span>
              <i className="fas fa-times text-sm" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Alert;