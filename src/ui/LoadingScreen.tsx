import React, { useMemo, useEffect, useState } from 'react';
import { UseQueryResult } from '@tanstack/react-query';

// Unified dependency types for the new simple API
export type LoadingDependency = 
  | { query: UseQueryResult<unknown, unknown>; message: string }
  | { condition: () => boolean; message: string }
  | { promise: Promise<unknown>; message: string }
  | { loading: boolean; message?: string }; // for auth loading

export interface LoadingScreenProps {
  waitFor?: LoadingDependency[];
  children?: React.ReactNode;
  pollingInterval?: number; // milliseconds, defaults to 100
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  waitFor = [],
  children,
  pollingInterval = 100
}) => {
  const [pollingTrigger, setPollingTrigger] = useState(0);
  
  // Check for condition dependencies that need polling
  const hasConditionDependencies = useMemo(() => {
    return waitFor.some(dep => 'condition' in dep);
  }, [waitFor]);
  
  // Poll condition dependencies
  useEffect(() => {
    if (!hasConditionDependencies) return;
    
    const interval = setInterval(() => {
      setPollingTrigger(prev => prev + 1);
    }, pollingInterval);
    
    return () => clearInterval(interval);
  }, [hasConditionDependencies, pollingInterval]);
  
  // Derive loading state and message from dependencies
  const { loading, message } = useMemo(() => {
    for (const dependency of waitFor) {
      if ('query' in dependency) {
        if (dependency.query.isLoading || dependency.query.isFetching) {
          return { loading: true, message: dependency.message };
        }
      } else if ('condition' in dependency) {
        if (!dependency.condition()) {
          return { loading: true, message: dependency.message };
        }
      } else if ('loading' in dependency) {
        if (dependency.loading) {
          return { 
            loading: true, 
            message: dependency.message 
          };
        }
      }
      // Note: Promise dependencies would need external state management
      // since promises don't expose loading state directly
    }
    
    return { loading: false, message: undefined };
    // pollingTrigger is intentionally included to force re-evaluation of condition functions
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitFor, pollingTrigger]);

  // Stop polling when all conditions are satisfied  
  useEffect(() => {
    if (!loading && hasConditionDependencies) {
      // Reset polling trigger but don't clear the interval
      // The interval will be cleared by the dependency change in the polling useEffect
    }
  }, [loading, hasConditionDependencies]);

  if (loading) {
    return (
      <div 
        className="fixed inset-0 flex flex-col justify-center items-center bg-white bg-opacity-95 dark:bg-gray-900 dark:bg-opacity-95 backdrop-blur-sm z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="loading-title"
        aria-describedby="loading-message"
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 animate-fade-in">
          <div className="flex flex-col items-center">
            <div
              className="border-4 border-gray-200 dark:border-gray-600 border-t-primary-600 dark:border-t-primary-400 rounded-full w-16 h-16 animate-spin"
              role="status"
              aria-hidden="true"
            />
            <h2 id="loading-title" className="mt-6 text-xl text-gray-900 dark:text-gray-100 font-semibold">
              Loading...
            </h2>
            {message && (
              <p
                id="loading-message"
                className="mt-3 text-sm text-gray-600 dark:text-gray-400 text-center"
                aria-live="polite"
                aria-atomic="true"
              >
                {message}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default LoadingScreen;