/**
 * User Accounts E2E Tests - Step 7: Migration Progress Tracking
 * 
 * Testing that migration progress is tracked correctly through all phases,
 * with accurate progress percentages, phase information, and error handling
 */

import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Next.js components
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    pathname: '/auth',
    query: {},
  }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: any) => {
    const React = require('react');
    return React.createElement('img', { src, alt, ...props });
  },
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => {
    const React = require('react');
    return React.createElement('a', { href, ...props }, children);
  },
}));

// Import test utilities
import { 
  createMockSupabaseClient,
  clearTestLocalStorage,
  populateLocalStorageWithTestData,
  createTestLocalStorageData
} from '../lib/storage/__tests__/test-utils';

// Import components and types
import { MigrationProgressComponent } from '../components/auth/MigrationProgress';
import { MigrationSuccess } from '../components/auth/MigrationSuccess';
import type { MigrationProgress, MigrationResult, MigrationPhase } from '../types/migration';

// Mock dependencies
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase');

describe('Migration Progress Tracking E2E Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    clearTestLocalStorage();
  });

  afterEach(() => {
    clearTestLocalStorage();
  });

  test('migration progress component displays all phases correctly', async () => {

    const phases: MigrationPhase[] = ['export', 'transform', 'validate', 'upload', 'verify', 'complete'];
    const expectedLabels = {
      export: 'Loading your data...',
      transform: 'Preparing data...',
      validate: 'Validating data...',
      upload: 'Uploading to cloud...',
      verify: 'Verifying data...',
      complete: 'Migration complete!'
    };

    for (const phase of phases) {
      const progress: MigrationProgress = {
        phase,
        progress: phase === 'complete' ? 100 : Math.random() * 80 + 10, // 10-90% for non-complete phases
        message: `Processing ${phase} phase...`,
      };

      const { rerender } = render(
        <MigrationProgressComponent progress={progress} />
      );

      // Verify phase label is displayed
      expect(screen.getByText(expectedLabels[phase])).toBeInTheDocument();

      // Verify progress percentage is displayed
      expect(screen.getByText(`${Math.round(progress.progress)}%`)).toBeInTheDocument();

      // Verify progress message is displayed
      expect(screen.getByText(progress.message)).toBeInTheDocument();

      // Verify phase icons are present (check for emojis in DOM)
      const phaseIcons = {
        export: '📦',
        transform: '🔧',
        validate: '✅',
        upload: '☁️',
        verify: '🔍',
        complete: '🎉'
      };
      expect(screen.getByText(phaseIcons[phase])).toBeInTheDocument();

      // Clean up for next iteration
      rerender(<div />);
    }
  });

  test('migration progress tracks completion states correctly', async () => {

    const phases: MigrationPhase[] = ['export', 'transform', 'validate', 'upload', 'verify'];

    // Test phase progression
    for (let currentPhaseIndex = 0; currentPhaseIndex < phases.length; currentPhaseIndex++) {
      const progress: MigrationProgress = {
        phase: phases[currentPhaseIndex],
        progress: (currentPhaseIndex + 1) * 20, // 20%, 40%, 60%, 80%, 100%
        message: `Currently in ${phases[currentPhaseIndex]} phase`,
      };

      const { rerender } = render(
        <MigrationProgressComponent progress={progress} />
      );

      // Check phase indicators - should show completed phases
      const progressContainer = document.querySelector('.migration-progress');
      
      // Find all phase indicator elements
      const indicatorElements = screen.getAllByText(/^[1-6]$|^✓$/);
      
      // Verify completed phases show checkmarks
      for (let i = 0; i < currentPhaseIndex; i++) {
        // Previous phases should be marked as complete
        const completedIndicators = screen.getAllByText('✓');
        expect(completedIndicators.length).toBeGreaterThanOrEqual(i);
      }

      // Current phase should show number
      expect(screen.getByText((currentPhaseIndex + 1).toString())).toBeInTheDocument();

      rerender(<div />);
    }

  });

  test('migration progress handles error states appropriately', async () => {

    const errorProgress: MigrationProgress = {
      phase: 'upload',
      progress: 45,
      message: 'Processing upload phase...',
      error: 'Network connection failed during upload'
    };

    render(<MigrationProgressComponent progress={errorProgress} />);

    // Verify error state is displayed
    expect(screen.getByText('Migration Error')).toBeInTheDocument();
    expect(screen.getByText('Migration Failed')).toBeInTheDocument();
    expect(screen.getByText(errorProgress.error!)).toBeInTheDocument();

    // Verify progress bar shows error color (red)
    const progressBar = document.querySelector('.bg-red-500');
    expect(progressBar).toBeInTheDocument();

    // Verify error message is in red error box
    const errorBox = screen.getByText(errorProgress.error!).parentElement;
    expect(errorBox).toHaveClass('text-red-600', 'bg-red-50');

  });

  test('migration progress shows active loading animation', async () => {

    const activeProgress: MigrationProgress = {
      phase: 'transform',
      progress: 35,
      message: 'Transforming data structures...',
    };

    // Test active state
    const { rerender } = render(
      <MigrationProgressComponent progress={activeProgress} isActive={true} />
    );

    // Should show animated loading indicator
    const animatedElement = document.querySelector('.animate-pulse');
    expect(animatedElement).toBeInTheDocument();

    // Test inactive state
    rerender(
      <MigrationProgressComponent progress={activeProgress} isActive={false} />
    );

    // Should not show animated loading indicator when inactive
    const inactiveAnimatedElement = document.querySelector('.animate-pulse');
    expect(inactiveAnimatedElement).not.toBeInTheDocument();

    // Test completed state (should not show animation even if active)
    const completedProgress: MigrationProgress = {
      phase: 'complete',
      progress: 100,
      message: 'Migration completed successfully!',
    };

    rerender(
      <MigrationProgressComponent progress={completedProgress} isActive={true} />
    );

    // Should not show animation for completed state
    const completedAnimatedElement = document.querySelector('.animate-pulse');
    expect(completedAnimatedElement).not.toBeInTheDocument();

  });

  test('migration success component displays result summary correctly', async () => {

    const mockMigrationResult: MigrationResult = {
      success: true,
      migratedLeagues: 3,
      migratedDrafts: 12,
      migrationId: 'migration-test-123',
      startTime: new Date('2024-08-04T10:00:00Z'),
      endTime: new Date('2024-08-04T10:02:30Z'),
      duration: 150000 // 2.5 minutes
    };

    const onContinueMock = jest.fn();

    render(
      <MigrationSuccess 
        migrationResult={mockMigrationResult}
        userName="Test User"
        onContinue={onContinueMock}
      />
    );

    // Verify celebration header
    expect(screen.getByText('Migration Complete!')).toBeInTheDocument();
    expect(screen.getByText('Welcome to your account, Test User!')).toBeInTheDocument();
    expect(screen.getByText('🎉')).toBeInTheDocument();

    // Verify migration summary
    expect(screen.getByText('Migration Summary')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // Leagues count
    expect(screen.getByText('12')).toBeInTheDocument(); // Drafts count
    expect(screen.getByText('Leagues Migrated')).toBeInTheDocument();
    expect(screen.getByText('Drafts Migrated')).toBeInTheDocument();

    // Verify performance stats
    expect(screen.getByText('Migration Time:')).toBeInTheDocument();
    expect(screen.getByText('3 minutes')).toBeInTheDocument(); // 150000ms = 150 seconds = 2.5 minutes ≈ 3 minutes
    expect(screen.getByText('Total Items:')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument(); // 3 leagues + 12 drafts

    // Verify what's next section
    expect(screen.getByText("What's Next?")).toBeInTheDocument();
    expect(screen.getByText('Your data is now synced across all your devices')).toBeInTheDocument();
    expect(screen.getByText('Automatic backups ensure your work is never lost')).toBeInTheDocument();

    // Verify action buttons
    expect(screen.getByText('Continue to Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Refresh Page')).toBeInTheDocument();

    // Verify technical details (collapsed by default)
    expect(screen.getByText('Technical Details')).toBeInTheDocument();
    
    // Expand technical details
    const technicalDetails = screen.getByText('Technical Details');
    act(() => {
      technicalDetails.click();
    });

    // Check that technical details are now visible
    expect(screen.getByText(`Migration ID: ${mockMigrationResult.migrationId}`)).toBeInTheDocument();
    expect(screen.getByText(/Started:/)).toBeInTheDocument();
    expect(screen.getByText(/Completed:/)).toBeInTheDocument();

  });

  test('migration success handles different data scenarios', async () => {

    // Test scenario with no leagues or drafts
    const emptyResult: MigrationResult = {
      success: true,
      migratedLeagues: 0,
      migratedDrafts: 0,
      migrationId: 'empty-migration-123',
      duration: 5000 // 5 seconds
    };

    const { rerender } = render(
      <MigrationSuccess migrationResult={emptyResult} />
    );

    // Verify empty state handling - use getAllByText since "0" appears multiple times
    const zeroTexts = screen.getAllByText('0');
    expect(zeroTexts.length).toBeGreaterThanOrEqual(2); // Should appear for leagues and drafts
    expect(screen.getByText('Leagues Migrated')).toBeInTheDocument(); // Plural handling
    expect(screen.getByText('Drafts Migrated')).toBeInTheDocument(); // Plural handling
    expect(screen.getByText('5 seconds')).toBeInTheDocument(); // Duration formatting

    // Test scenario with single items (singular labels)
    const singleItemResult: MigrationResult = {
      success: true,
      migratedLeagues: 1,
      migratedDrafts: 1,
      migrationId: 'single-migration-123',
      duration: 1000 // 1 second
    };

    rerender(<MigrationSuccess migrationResult={singleItemResult} />);

    // Verify singular form handling
    expect(screen.getByText('League Migrated')).toBeInTheDocument(); // Singular
    expect(screen.getByText('Draft Migrated')).toBeInTheDocument(); // Singular
    expect(screen.getByText('1 second')).toBeInTheDocument(); // Singular duration

    // Test scenario with large numbers
    const largeNumberResult: MigrationResult = {
      success: true,
      migratedLeagues: 25,
      migratedDrafts: 150,
      migrationId: 'large-migration-123',
      duration: 300000 // 5 minutes
    };

    rerender(<MigrationSuccess migrationResult={largeNumberResult} />);

    // Verify large number handling
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('175')).toBeInTheDocument(); // Total items (formatted with commas if needed)
    expect(screen.getByText('5 minutes')).toBeInTheDocument();

  });

  test('migration components integrate with full user flow', async () => {

    // Setup: Create test data in localStorage
    const testData = createTestLocalStorageData();
    populateLocalStorageWithTestData(testData);

    // Mock Supabase client
    const mockSupabaseClient = createMockSupabaseClient();
    (mockSupabaseClient as any).auth = (mockSupabaseClient as any).auth || {};
    (supabase as any).auth = (mockSupabaseClient as any).auth;
    (supabase as any).from = mockSupabaseClient.from;

    // Simulate a multi-phase migration progress sequence
    const migrationPhases: MigrationProgress[] = [
      {
        phase: 'export',
        progress: 10,
        message: 'Loading your fantasy data from device storage...'
      },
      {
        phase: 'transform',
        progress: 30,
        message: 'Converting data for cloud storage...'
      },
      {
        phase: 'validate',
        progress: 50,
        message: 'Checking data integrity...'
      },
      {
        phase: 'upload',
        progress: 75,
        message: 'Uploading to secure cloud storage...'
      },
      {
        phase: 'verify',
        progress: 90,
        message: 'Verifying successful upload...'
      },
      {
        phase: 'complete',
        progress: 100,
        message: 'Migration completed successfully!'
      }
    ];

    // Test each phase
    for (let i = 0; i < migrationPhases.length; i++) {
      const currentProgress = migrationPhases[i];
      
      const { rerender } = render(
        <MigrationProgressComponent 
          progress={currentProgress} 
          isActive={currentProgress.phase !== 'complete'}
        />
      );

      // Verify current phase is displayed correctly
      expect(screen.getByText(`${currentProgress.progress}%`)).toBeInTheDocument();
      expect(screen.getByText(currentProgress.message)).toBeInTheDocument();

      // Verify phase indicators show correct completion state
      const completedPhases = i; // Number of phases before current one
      if (completedPhases > 0) {
        const checkmarks = screen.getAllByText('✓');
        expect(checkmarks.length).toBeGreaterThanOrEqual(completedPhases);
      }

      // Clean up for next phase
      rerender(<div />);
    }

    // Test final success state with simple known values
    const finalResult: MigrationResult = {
      success: true,
      migratedLeagues: 2,
      migratedDrafts: 5,
      migrationId: 'integration-test-123',
      duration: 45000 // 45 seconds
    };

    render(<MigrationSuccess migrationResult={finalResult} />);

    // Verify success state shows expected data counts
    expect(screen.getByText('Migration Complete!')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Leagues count
    expect(screen.getByText('5')).toBeInTheDocument(); // Drafts count
    expect(screen.getByText('45 seconds')).toBeInTheDocument(); // Duration

  });
});