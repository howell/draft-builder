import React from 'react';
import { Card } from './Card';
import { Button } from './Button';

interface ErrorScreenProps {
  message: string;
  onRetry?: () => void;
  title?: string;
}

const ErrorScreen: React.FC<ErrorScreenProps> = ({ 
  message, 
  onRetry,
  title = "Something went wrong"
}) => {
  return (
    <div className="flex justify-center items-center min-h-[24rem] w-full p-4">
      <Card className="bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 max-w-md w-full">
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-red-100 dark:bg-red-900/40 p-3">
              <svg
                className="h-8 w-8 text-red-600 dark:text-red-400"
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" 
                />
              </svg>
            </div>
          </div>
          
          <h1 id="error-title" className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            {title}
          </h1>

          <p id="error-message" className="text-gray-600 dark:text-gray-400 mb-6">
            {message}
          </p>
          
          {onRetry && (
            <Button onClick={onRetry} variant="primary">
              Try Again
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
};

export default ErrorScreen;