import React from 'react';
import { render, screen, act } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import LoadingScreen from '../LoadingScreen';

// Simplified React Query mock utilities
// LoadingScreen only uses isLoading and isFetching, so we focus on those
const createMockQuery = (
  isLoading = false, 
  isFetching = false, 
  isSuccess = true, 
  data: any = null, 
  error: Error | null = null
): UseQueryResult<any, any> => {
  // Use double assertion for test mocks - common pattern for bypassing strict discriminated union types
  // This approach is used throughout the existing codebase (see useApiClientQuery.test.ts line 121)
  return {
    data,
    error,
    isLoading,
    isFetching,
    isSuccess,
    isError: !!error,
    isPending: isLoading,
    refetch: jest.fn(),
    fetchStatus: isLoading || isFetching ? 'fetching' : 'idle',
    status: isLoading ? 'pending' : isSuccess ? 'success' : 'error',
  } as unknown as UseQueryResult<any, any>;
};

describe('LoadingScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('boolean loading dependencies', () => {
    it('should display loading spinner when loading is true', () => {
      render(
        <LoadingScreen waitFor={[{ loading: true, message: 'Authenticating...' }]}>
          <div>Content loaded</div>
        </LoadingScreen>
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByText('Authenticating...')).toBeInTheDocument();
      expect(screen.queryByText('Content loaded')).not.toBeInTheDocument();
    });

    it('should hide loading spinner when loading is false', () => {
      render(
        <LoadingScreen waitFor={[{ loading: false, message: 'Authenticating...' }]}>
          <div>Content loaded</div>
        </LoadingScreen>
      );

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.queryByText('Authenticating...')).not.toBeInTheDocument();
      expect(screen.getByText('Content loaded')).toBeInTheDocument();
    });

    it('should use default message when message is not provided', () => {
      render(
        <LoadingScreen waitFor={[{ loading: true }]}>
          <div>Content loaded</div>
        </LoadingScreen>
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  describe('query dependencies', () => {
    it('should display loading spinner when query is loading', () => {
      const mockQuery = createMockQuery(true, false);
      
      render(
        <LoadingScreen waitFor={[{ query: mockQuery, message: 'Loading data...' }]}>
          <div>Content loaded</div>
        </LoadingScreen>
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByText('Loading data...')).toBeInTheDocument();
      expect(screen.queryByText('Content loaded')).not.toBeInTheDocument();
    });

    it('should display loading spinner when query is fetching', () => {
      const mockQuery = createMockQuery(false, true);
      
      render(
        <LoadingScreen waitFor={[{ query: mockQuery, message: 'Loading data...' }]}>
          <div>Content loaded</div>
        </LoadingScreen>
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByText('Loading data...')).toBeInTheDocument();
    });

    it('should hide loading spinner when query is loaded', () => {
      const mockQuery = createMockQuery(false, false, true, 'test');
      
      render(
        <LoadingScreen waitFor={[{ query: mockQuery, message: 'Loading data...' }]}>
          <div>Content loaded</div>
        </LoadingScreen>
      );

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.queryByText('Loading data...')).not.toBeInTheDocument();
      expect(screen.getByText('Content loaded')).toBeInTheDocument();
    });
  });

  describe('condition dependencies', () => {
    it('should display loading spinner when condition returns false', () => {
      const pollingInterval = 50;
      render(
        <LoadingScreen 
          waitFor={[{ condition: () => false, message: 'Waiting for setup...' }]}
          pollingInterval={pollingInterval}
        >
          <div>Content loaded</div>
        </LoadingScreen>
      );

      // Advance timers to trigger condition polling
      act(() => {
        jest.advanceTimersByTime(pollingInterval);
      });

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByText('Waiting for setup...')).toBeInTheDocument();
      expect(screen.queryByText('Content loaded')).not.toBeInTheDocument();
    });

    it('should hide loading spinner when condition returns true', () => {
      const pollingInterval = 50;
      render(
        <LoadingScreen 
          waitFor={[{ condition: () => true, message: 'Waiting for setup...' }]}
          pollingInterval={pollingInterval}
        >
          <div>Content loaded</div>
        </LoadingScreen>
      );

      // Advance timers to trigger condition polling
      act(() => {
        jest.advanceTimersByTime(pollingInterval);
      });

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.queryByText('Waiting for setup...')).not.toBeInTheDocument();
      expect(screen.getByText('Content loaded')).toBeInTheDocument();
    });

    it('should poll condition dependencies and update when condition changes', () => {
      const pollingInterval = 50;
      let shouldLoad = false; // Start with loading state (condition returns false)
      const condition = jest.fn(() => shouldLoad);
      
      render(
        <LoadingScreen 
          waitFor={[{ condition, message: 'Checking condition...' }]}
          pollingInterval={pollingInterval}
        >
          <div>Content loaded</div>
        </LoadingScreen>
      );

      // Initial state - should be loading
      act(() => {
        jest.advanceTimersByTime(pollingInterval);
      });

      expect(condition).toHaveBeenCalled();
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByText('Checking condition...')).toBeInTheDocument();
      expect(screen.queryByText('Content loaded')).not.toBeInTheDocument();

      // Change condition and advance timers
      shouldLoad = true;
      act(() => {
        jest.advanceTimersByTime(pollingInterval);
      });

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.queryByText('Checking condition...')).not.toBeInTheDocument();
      expect(screen.getByText('Content loaded')).toBeInTheDocument();
    });
  });

  describe('multiple dependencies', () => {
    it('should show loading if any dependency is loading', () => {
      const mockQuery = createMockQuery(false, false); // not loading
      
      render(
        <LoadingScreen waitFor={[
          { loading: false, message: 'Auth complete' },
          { query: mockQuery, message: 'Data loaded' },
          { loading: true, message: 'Processing...' }
        ]}>
          <div>Content loaded</div>
        </LoadingScreen>
      );

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByText('Processing...')).toBeInTheDocument();
    });

    it('should show the first loading dependency message', () => {
      render(
        <LoadingScreen waitFor={[
          { loading: true, message: 'First loading...' },
          { loading: true, message: 'Second loading...' }
        ]}>
          <div>Content loaded</div>
        </LoadingScreen>
      );

      expect(screen.getByText('First loading...')).toBeInTheDocument();
      expect(screen.queryByText('Second loading...')).not.toBeInTheDocument();
    });

    it('should hide loading when all dependencies are complete', () => {
      const mockQuery = createMockQuery(false, false, true);
      
      render(
        <LoadingScreen waitFor={[
          { loading: false, message: 'Auth complete' },
          { query: mockQuery, message: 'Data loaded' },
          { condition: () => true, message: 'Setup complete' }
        ]}>
          <div>Content loaded</div>
        </LoadingScreen>
      );

      // Advance timers for condition polling
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.getByText('Content loaded')).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('should not show loading screen with empty waitFor array', () => {
      render(
        <LoadingScreen waitFor={[]}>
          <div>Content loaded</div>
        </LoadingScreen>
      );

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.getByText('Content loaded')).toBeInTheDocument();
    });

    it('should not show loading screen when waitFor is undefined', () => {
      render(
        <LoadingScreen>
          <div>Content loaded</div>
        </LoadingScreen>
      );

      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.getByText('Content loaded')).toBeInTheDocument();
    });

    it('should show content when condition becomes satisfied', () => {
      const pollingInterval = 50;
      let shouldShowContent = false;
      const condition = jest.fn(() => shouldShowContent);
      
      render(
        <LoadingScreen 
          waitFor={[{ condition, message: 'Polling...' }]}
          pollingInterval={pollingInterval}
        >
          <div>Content loaded</div>
        </LoadingScreen>
      );

      // Initially should be loading
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(screen.getByText('Polling...')).toBeInTheDocument();
      expect(screen.queryByText('Content loaded')).not.toBeInTheDocument();

      // Change condition to return true
      shouldShowContent = true;
      
      // Advance timer by one interval to trigger polling
      act(() => {
        jest.advanceTimersByTime(pollingInterval);
      });
      
      // Should now show content
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
      expect(screen.queryByText('Polling...')).not.toBeInTheDocument();
      expect(screen.getByText('Content loaded')).toBeInTheDocument();
      
      // Should have been called at least twice (initial + polling)
      expect(condition.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('accessibility', () => {
    it('should have proper ARIA attributes', () => {
      render(
        <LoadingScreen waitFor={[{ loading: true, message: 'Loading data...' }]}>
          <div>Content</div>
        </LoadingScreen>
      );

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'loading-title');
      expect(dialog).toHaveAttribute('aria-describedby', 'loading-message');

      // Find the spinner by its attributes since role="status" might be hidden
      const spinner = dialog.querySelector('[role="status"]');
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveAttribute('aria-hidden', 'true');

      const message = screen.getByText('Loading data...');
      expect(message).toHaveAttribute('aria-live', 'polite');
      expect(message).toHaveAttribute('aria-atomic', 'true');
    });

    it('should not render content when loading', () => {
      render(
        <LoadingScreen waitFor={[{ loading: true, message: 'Loading...' }]}>
          <div>Main content</div>
        </LoadingScreen>
      );

      // Content should not exist in the DOM at all during loading
      expect(screen.queryByText('Main content')).not.toBeInTheDocument();
      
      // Only the loading dialog should be present
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Loading...' })).toBeInTheDocument();
    });
  });
});