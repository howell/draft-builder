/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CustomRankings from '../CustomRankings';
import type { Player } from '@/platforms/PlatformApi';

/**
 * Covers the save-failure path, which cannot be exercised end-to-end: the
 * fixture environment has no reachable Supabase, so SupabaseStorageAdapter
 * silently falls back to Dexie and every save succeeds. Failing the save
 * requires controlling the adapter, so this mounts the page with the data hooks
 * stubbed and a save mutation that rejects on demand.
 */

const LEAGUE = '123456';

let saveShouldFail = true;
const saveAttempts: unknown[] = [];

function player(id: string, position: string, name: string): Player {
  return {
    fullName: name,
    ids: { espn: id, sleeper: '', yahoo: '' },
    position,
    eligiblePositions: [position, 'BN'],
    platformPrice: 10,
    platformRank: Number(id),
  };
}

const PLAYERS = [player('1', 'QB', 'Alpha'), player('2', 'QB', 'Bravo')];

jest.mock('@/lib/auth/context', () => ({
  useAuth: () => ({ user: { id: 'u1' }, loading: false }),
}));

jest.mock('@/hooks/queries/useLeagueQuery', () => ({
  useLeagueQuery: () => ({ data: { league: { platform: 'espn', id: '123456' } } }),
}));

jest.mock('@/hooks/queries/useLeaguesQuery', () => ({
  useLeaguesQuery: () => ({ data: { leagues: { leagues: {} } } }),
}));

jest.mock('@/hooks/queries', () => ({
  usePlayersQuery: () => ({ data: PLAYERS, isLoading: false, isFetching: false }),
  useLeagueHistoryQuery: () => ({
    data: { '2026': { scoringType: 'ppr', rosterSettings: { QB: 1 }, draft: { auctionBudget: 200 } } },
    isLoading: false,
    isFetching: false,
  }),
  useRankingsQuery: () => ({
    data: [
      {
        name: 'Platform',
        shortName: 'Rnk',
        value: {
          platform: 'espn',
          overall: new Map([['1', 0], ['2', 1]]),
          positional: new Map(),
        },
      },
    ],
    isLoading: false,
    isFetching: false,
  }),
  useCustomRankingsQuery: () => ({ data: null, isLoading: false, isFetching: false }),
  useSaveCustomRankingsMutation: () => ({
    mutate: (params: unknown, opts?: { onSuccess?: () => void; onError?: () => void }) => {
      saveAttempts.push(params);
      if (saveShouldFail) {
        opts?.onError?.();
      } else {
        opts?.onSuccess?.();
      }
    },
    isPending: false,
    error: null,
  }),
  useCustomRankingsIndexQuery: () => ({ data: [], isLoading: false }),
  useImportCustomRankingsMutation: () => ({ mutate: jest.fn(), isPending: false, error: null }),
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CustomRankings leagueId={LEAGUE} googleApiKey='k' />
    </QueryClientProvider>
  );
}

/** Let the 700ms autosave debounce elapse. */
const flushAutosave = () => act(async () => {
  await new Promise(resolve => setTimeout(resolve, 900));
});

beforeEach(() => {
  saveShouldFail = true;
  saveAttempts.length = 0;
});

describe('CustomRankings save failures', () => {
  it('surfaces a retry action instead of losing the edit', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId('ranking-move-down-1'));
    await flushAutosave();

    expect(saveAttempts).toHaveLength(1);
    expect(screen.getByTestId('rankings-save-state')).toHaveTextContent('Not saved');
    const retry = screen.getByTestId('rankings-retry-save');
    expect(retry).toBeInTheDocument();

    // The pending edit must survive the failure, so retrying re-sends it.
    saveShouldFail = false;
    await user.click(retry);

    expect(saveAttempts).toHaveLength(2);
    expect(screen.getByTestId('rankings-save-state')).toHaveTextContent('Saved');
    expect(screen.queryByTestId('rankings-retry-save')).not.toBeInTheDocument();
  });

  it('keeps retrying the edit on the next change rather than dropping it', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByTestId('ranking-move-down-1'));
    await flushAutosave();
    expect(screen.getByTestId('rankings-save-state')).toHaveTextContent('Not saved');

    // A further edit after a failure must still carry the earlier one.
    saveShouldFail = false;
    await user.click(screen.getByTestId('ranking-move-down-2'));
    await flushAutosave();

    expect(screen.getByTestId('rankings-save-state')).toHaveTextContent('Saved');
  });

  it('flushes a failed edit when the page unmounts', async () => {
    // The real data-loss path. Previously the pending edit was cleared *before*
    // the save was attempted, so a failure left nothing to flush — and the
    // unmount effect closed over the first render's `persist`, when `league` was
    // still undefined and it returned immediately, making it inert regardless.
    const user = userEvent.setup();
    const { unmount } = renderPage();

    await user.click(await screen.findByTestId('ranking-move-down-1'));
    await flushAutosave();
    expect(saveAttempts).toHaveLength(1);
    expect(screen.getByTestId('rankings-save-state')).toHaveTextContent('Not saved');

    saveShouldFail = false;
    act(() => { unmount(); });

    // Navigating away must re-attempt the edit rather than discard it.
    expect(saveAttempts).toHaveLength(2);
  });

  it('clears the pending edit only once a save succeeds', async () => {
    const user = userEvent.setup();
    saveShouldFail = false;
    renderPage();

    await user.click(await screen.findByTestId('ranking-move-down-1'));
    await flushAutosave();
    expect(saveAttempts).toHaveLength(1);

    // Nothing outstanding, so a retry affordance should not be offered at all.
    expect(screen.queryByTestId('rankings-retry-save')).not.toBeInTheDocument();
  });
});
