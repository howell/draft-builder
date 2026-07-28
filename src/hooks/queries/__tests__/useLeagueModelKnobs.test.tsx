/**
 * @jest-environment jsdom
 */

import React, { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useLeagueModelKnobsQuery,
  useSaveLeagueModelKnobsMutation,
  LeagueModelKnobs,
} from '../useLeagueModelKnobs';
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

const KNOBS: LeagueModelKnobs = {
  elasticity: 0,
  blend: 0.6,
  calibratedAt: '2026-07-27T13:00:00.000Z',
  seasons: ['2019', '2020', '2021', '2022', '2023', '2024', '2025'],
  config: { positionalValues: false, usePriors: false, useExpectedUnspent: false },
};

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

// Let pending queries/mutations settle (see useLeaguePriceMultipliers.test.tsx).
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 10)));

beforeEach(() => {
  adapter = new MemoryStorageAdapter();
  mockUseAuth.mockReturnValue({ user: TEST_USER, loading: false });
});

describe('useLeagueModelKnobsQuery', () => {
  it('returns an empty map when no league has been calibrated', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useLeagueModelKnobsQuery(), { wrapper });

    await settle();
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual({});
  });

  it('returns the stored knobs map', async () => {
    await adapter.setUserSetting('app', 'leagueModelKnobs', { 'lg-a': KNOBS });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useLeagueModelKnobsQuery(), { wrapper });

    await settle();
    expect(result.current.data).toEqual({ 'lg-a': KNOBS });
  });
});

describe('useSaveLeagueModelKnobsMutation', () => {
  it('saves one league without clobbering others and updates the cache', async () => {
    await adapter.setUserSetting('app', 'leagueModelKnobs', {
      'lg-b': { ...KNOBS, blend: 0.3 },
    });

    const { queryClient, wrapper } = makeWrapper();
    const { result } = renderHook(() => useSaveLeagueModelKnobsMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ leagueId: 'lg-a', knobs: KNOBS });
    });

    expect(await adapter.getUserSetting('app', 'leagueModelKnobs')).toEqual({
      'lg-a': KNOBS,
      'lg-b': { ...KNOBS, blend: 0.3 },
    });
    expect(queryClient.getQueryData(cacheKeys.leagueModelKnobs(TEST_USER.id))).toEqual({
      'lg-a': KNOBS,
      'lg-b': { ...KNOBS, blend: 0.3 },
    });
  });

  it('clears a league calibration when knobs is null', async () => {
    await adapter.setUserSetting('app', 'leagueModelKnobs', { 'lg-a': KNOBS });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSaveLeagueModelKnobsMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ leagueId: 'lg-a', knobs: null });
    });

    expect(await adapter.getUserSetting('app', 'leagueModelKnobs')).toEqual({});
  });
});
