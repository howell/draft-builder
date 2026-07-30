/**
 * @jest-environment jsdom
 */

import React, { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useLeagueRosterPlansQuery,
  useSaveLeagueRosterPlanMutation,
  LeagueRosterPlan,
} from '../useLeagueRosterPlans';
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

const PLAN: LeagueRosterPlan = {
  teamId: '4',
  selections: {
    'RB#0': { playerId: '4429795', delta: 3 },
    'WR#1': { playerId: '4262921', delta: -2 },
  },
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

describe('useLeagueRosterPlansQuery', () => {
  it('returns an empty map when no league has a plan', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useLeagueRosterPlansQuery(), { wrapper });

    await settle();
    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual({});
  });

  it('returns the stored plan map', async () => {
    await adapter.setUserSetting('app', 'liveDraftRosterPlans', { 'lg-a': PLAN });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useLeagueRosterPlansQuery(), { wrapper });

    await settle();
    expect(result.current.data).toEqual({ 'lg-a': PLAN });
  });
});

describe('useSaveLeagueRosterPlanMutation', () => {
  it('saves one league without clobbering others and updates the cache', async () => {
    const other: LeagueRosterPlan = { selections: { 'QB#0': { playerId: 'x', delta: 0 } } };
    await adapter.setUserSetting('app', 'liveDraftRosterPlans', { 'lg-b': other });

    const { queryClient, wrapper } = makeWrapper();
    const { result } = renderHook(() => useSaveLeagueRosterPlanMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ leagueId: 'lg-a', plan: PLAN });
    });

    expect(await adapter.getUserSetting('app', 'liveDraftRosterPlans')).toEqual({
      'lg-a': PLAN,
      'lg-b': other,
    });
    expect(queryClient.getQueryData(cacheKeys.leagueRosterPlans(TEST_USER.id))).toEqual({
      'lg-a': PLAN,
      'lg-b': other,
    });
  });

  it('clears a league plan when plan is null', async () => {
    await adapter.setUserSetting('app', 'liveDraftRosterPlans', { 'lg-a': PLAN });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSaveLeagueRosterPlanMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ leagueId: 'lg-a', plan: null });
    });

    expect(await adapter.getUserSetting('app', 'liveDraftRosterPlans')).toEqual({});
  });
});
