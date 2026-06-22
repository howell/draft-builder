/**
 * @jest-environment jsdom
 */

import React, { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useLeaguePriceMultipliersQuery,
  useSaveLeaguePriceMultiplierMutation,
} from '../useLeaguePriceMultipliers';
import { cacheKeys } from '../cache-keys';
import { MemoryStorageAdapter } from '@/lib/storage/memory';

// A single real Memory adapter backs the hooks so we exercise the actual
// get/setUserSetting round-trip rather than a hand-rolled mock.
let adapter: MemoryStorageAdapter;

const mockUseAuth = jest.fn();
jest.mock('@/lib/auth/context', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/lib/storage/hooks', () => ({
  useStorageAdapter: () => adapter,
}));

const TEST_USER = { id: 'user-1' };

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

// Let pending queries/mutations settle. `waitFor` trips a container-type check
// under this repo's jest setup, so existing hook tests settle via a timeout.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 10)));

beforeEach(() => {
  adapter = new MemoryStorageAdapter();
  mockUseAuth.mockReturnValue({ user: TEST_USER, loading: false });
});

describe('useLeaguePriceMultipliersQuery', () => {
  it('returns an empty map when nothing is stored', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useLeaguePriceMultipliersQuery(), { wrapper });

    await settle();
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual({});
  });

  it('returns the stored map', async () => {
    await adapter.setUserSetting('app', 'leaguePriceMultipliers', { 'lg-a': 1.333 });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useLeaguePriceMultipliersQuery(), { wrapper });

    await settle();
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual({ 'lg-a': 1.333 });
  });
});

describe('useSaveLeaguePriceMultiplierMutation', () => {
  it('sets a league override and updates the cache without a refetch', async () => {
    const { queryClient, wrapper } = makeWrapper();
    const { result } = renderHook(() => useSaveLeaguePriceMultiplierMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ leagueId: 'lg-a', multiplier: 1.25 });
    });

    // Persisted through the adapter
    expect(await adapter.getUserSetting('app', 'leaguePriceMultipliers')).toEqual({ 'lg-a': 1.25 });
    // Query cache reflects the new map via onSuccess setQueryData
    expect(queryClient.getQueryData(cacheKeys.leaguePriceMultipliers(TEST_USER.id))).toEqual({
      'lg-a': 1.25,
    });
  });

  it('clears only the targeted override when multiplier is null', async () => {
    await adapter.setUserSetting('app', 'leaguePriceMultipliers', { 'lg-a': 1.25, 'lg-b': 1.1 });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSaveLeaguePriceMultiplierMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ leagueId: 'lg-a', multiplier: null });
    });

    expect(await adapter.getUserSetting('app', 'leaguePriceMultipliers')).toEqual({ 'lg-b': 1.1 });
  });
});
