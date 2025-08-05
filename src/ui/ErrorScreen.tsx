import React from 'react';

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
    <div 
      className="flex justify-center items-center min-h-96 w-full bg-red-50 border border-red-200 rounded-lg"
      role="alert"
      aria-labelledby="error-title"
      aria-describedby="error-message"
    >
      <div className="text-center p-8 max-w-md">
        <div className="mb-4 text-red-500">
          <svg 
            className="mx-auto h-12 w-12" 
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
        
        <h1 id="error-title" className="text-xl font-semibold text-red-800 mb-3">
          {title}
        </h1>
        
        <p id="error-message" className="text-red-700 mb-6">
          {message}
        </p>
        
        {onRetry && (
          <button
            onClick={onRetry}
            className="bg-red-600 hover:bg-red-700 focus:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Try Again
          </button>
        )}
      </div>
    </div>
  );
};

export default ErrorScreen;