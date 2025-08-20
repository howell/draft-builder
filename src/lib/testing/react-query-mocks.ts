/**
 * Reusable React Query mock utilities for tests
 * 
 * These utilities provide consistent mock structures for React Query hooks
 * across all test files, reducing duplication and ensuring compatibility
 * with components that use LoadingScreen and other React Query patterns.
 */

import type { UseQueryResult } from '@tanstack/react-query';
import type { StoredLeaguesDataCurrent } from '@/types/storage';

/**
 * Creates a mock React Query result object
 * Based on the pattern from LoadingScreen unit tests
 */
export const createMockQuery = <TData = any, TError = any>(
  isLoading = false, 
  isFetching = false, 
  isSuccess = true, 
  data: TData | null = null, 
  error: TError | null = null
): UseQueryResult<TData, TError> => {
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
  } as unknown as UseQueryResult<TData, TError>;
};

/**
 * Creates a successful (loaded) query mock
 */
export const createSuccessQuery = <TData>(data: TData): UseQueryResult<TData, any> => {
  return createMockQuery(false, false, true, data, null);
};

/**
 * Creates a loading query mock
 */
export const createLoadingQuery = <TData = any>(message?: string): UseQueryResult<TData, any> => {
  return createMockQuery<TData>(true, false, false, null, null);
};

/**
 * Creates a fetching (refetching) query mock
 */
export const createFetchingQuery = <TData>(data: TData): UseQueryResult<TData, any> => {
  return createMockQuery(false, true, true, data, null);
};

/**
 * Creates an error query mock
 */
export const createErrorQuery = <TData = any>(error: Error): UseQueryResult<TData, any> => {
  return createMockQuery<TData>(false, false, false, null, error);
};

/**
 * Mock implementations for specific query hooks used in the application
 */

// DraftInfo structure from useUserDraftsQuery
export interface DraftInfo {
  draftName: string;
  leagueId: string;
  lastModified: Date;
  selectionCount: number;
  adjustmentCount: number;
}

export interface MockDraftsQueryData {
  totalDrafts: number;
  totalSelections: number;
  totalAdjustments: number;
  mostRecentDraft: {
    draftName: string;
    leagueId: string;
    lastModified: Date;
  } | null;
}

/**
 * Creates a mock leagues query with typical data structure
 */
export const createMockLeaguesQuery = (
  leagues: Record<string, any> = {},
  isLoading = false,
  error: Error | null = null
): UseQueryResult<StoredLeaguesDataCurrent, Error> => {
  const data: StoredLeaguesDataCurrent | null = error ? null : {
    leagues,
    schemaVersion: 3 as const
  };
  
  return createMockQuery(isLoading, false, !error && !isLoading, data, error);
};

/**
 * Creates a mock user drafts query (returns array of DraftInfo)
 */
export const createMockUserDraftsQuery = (
  drafts: DraftInfo[] = [],
  isLoading = false,
  error: Error | null = null
): UseQueryResult<DraftInfo[], any> => {
  const data = error ? null : drafts;
  return createMockQuery(isLoading, false, !error && !isLoading, data, error);
};

/**
 * Creates a mock drafts query with typical data structure
 */
export const createMockDraftsQuery = (
  draftsData: Partial<MockDraftsQueryData> = {},
  isLoading = false,
  error: Error | null = null
): UseQueryResult<MockDraftsQueryData, any> => {
  const defaultData: MockDraftsQueryData = {
    totalDrafts: 0,
    totalSelections: 0,
    totalAdjustments: 0,
    mostRecentDraft: null,
    ...draftsData
  };
  
  const data = error ? null : defaultData;
  
  return createMockQuery(isLoading, false, !error && !isLoading, data, error);
};

/**
 * Helper to setup React Query hook mocks for components that use both leagues and drafts
 */
export const setupQueryMocks = (
  useLeaguesQueryMock: jest.MockedFunction<any>,
  useUserDraftsQueryMock: jest.MockedFunction<any>,
  leagues: Record<string, any> = {},
  draftsInfo: DraftInfo[] = [],
  options: {
    leaguesLoading?: boolean;
    draftsLoading?: boolean;
    leaguesError?: Error;
    draftsError?: Error;
  } = {}
) => {
  const leaguesQuery = createMockLeaguesQuery(
    leagues, 
    options.leaguesLoading || false, 
    options.leaguesError || null
  );
  
  // Mock useUserDraftsQuery to return array of DraftInfo
  const userDraftsQuery = createMockUserDraftsQuery(
    draftsInfo,
    options.draftsLoading || false,
    options.draftsError || null
  );

  useLeaguesQueryMock.mockReturnValue(leaguesQuery);
  useUserDraftsQueryMock.mockReturnValue(userDraftsQuery);

  return { leaguesQuery, userDraftsQuery };
};