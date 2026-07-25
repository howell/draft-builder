/**
 * Regression tests for MockTable's load/save path.
 *
 * This is the code path behind the reported bug: opening a mock draft after a period
 * away showed selections from weeks earlier, and the debounced autosave then wrote
 * them back over the real data. Until now it had no component-level coverage at all —
 * MockTable.test.tsx covers only the four exported pure functions, and the only thing
 * exercising the effect was the Playwright authenticated block, which was itself
 * broken.
 *
 * These tests drive the effect directly through a swapped storage adapter, which is
 * what a sign-in does in the real app.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { StorageAdapter } from '@/lib/storage/interface';
import type { MockTableProps } from '../MockTable';
import type { DraftAnalysis, Rankings, StoredDraftDataCurrent } from '@/app/storage/savedMockTypes';
import type { SeasonId } from '@/platforms/common';
import { getInProgressSelectionsKey } from '@/lib/storage/constants';

// Mocked per-test so we can swap the adapter and flip authLoading, mirroring what
// AuthProvider does as a session resolves.
const authState: { loading: boolean; adapter: StorageAdapter } = {
  loading: false,
  adapter: {} as StorageAdapter,
};

jest.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    loading: authState.loading,
    error: null,
    storageAdapter: authState.adapter,
  }),
}));

jest.mock('@/lib/storage/hooks', () => ({
  useStorageAdapter: () => authState.adapter,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/league/42/mocks',
}));

import MockTable from '../MockTable';

const LEAGUE_ID = '42';
const IN_PROGRESS_KEY = getInProgressSelectionsKey(LEAGUE_ID);

const analysis: DraftAnalysis = {
  overall: [67.45, -0.03],
  positions: new Map([['QB', [48.61, -0.1]], ['RB', [76.17, -0.08]]]),
};

const players = [
  { id: '1', name: 'Brett Favre', defaultPosition: 'QB', positions: ['QB'], suggestedCost: 10, overallRank: 1, positionRank: 1 },
  { id: '2', name: 'Marshall Faulk', defaultPosition: 'RB', positions: ['RB'], suggestedCost: 34, overallRank: 2, positionRank: 1 },
];

const rankings: Rankings = {
  platform: 'sleeper',
  overall: new Map(players.map((p, i) => [p.id, i])),
  positional: new Map([
    ['QB', new Map([['1', 0]])],
    ['RB', new Map([['2', 0]])],
  ]),
};

const props: MockTableProps = {
  leagueId: LEAGUE_ID,
  auctionBudget: 100,
  positions: { QB: 1, RB: 1 },
  players,
  draftHistory: new Map<SeasonId, DraftAnalysis>([['2023', analysis]]),
  playerPositions: ['QB', 'RB'],
  availableRankings: [{ name: 'Ranks', shortName: 'Ranks', value: rankings }],
};

/** A saved draft holding one selection, as the storage layer would return it. */
function draftWith(playerName: string): StoredDraftDataCurrent {
  return {
    year: '2024',
    modified: Date.now(),
    rosterSelections: {
      '{"position":"QB","index":0}': {
        id: '1',
        name: playerName,
        defaultPosition: 'QB',
        positions: ['QB'],
        overallRank: 1,
        positionRank: 1,
        estimatedCost: 10,
      },
    },
    costAdjustments: {},
    estimationSettings: { years: ['2023'], weight: 50 },
    searchSettings: { positions: ['QB', 'RB'], playerCount: 200, minPrice: 1, maxPrice: 100, showOnlyAvailable: true },
  } as unknown as StoredDraftDataCurrent;
}

function makeAdapter(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    loadDraftByName: jest.fn().mockResolvedValue(undefined),
    saveSelectedRoster: jest.fn().mockResolvedValue(undefined),
    deleteRoster: jest.fn().mockResolvedValue(undefined),
    loadSavedMocks: jest.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as StorageAdapter;
}

function renderMockTable() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MockTable {...props} />
    </QueryClientProvider>
  );
}

/**
 * The QB slot's roster input holds the selected player's name, empty when unfilled.
 * Read this rather than searching the page for the name — every player also appears
 * in the available-players table, so a text search matches whether or not anything
 * is actually selected.
 */
const qbSlotValue = () =>
  (screen.getByTestId('roster-player-input-QB-0') as HTMLInputElement).value;

describe('MockTable load path', () => {
  beforeEach(() => {
    authState.loading = false;
    authState.adapter = makeAdapter();
  });

  it('does not read storage while auth is still resolving', async () => {
    const adapter = makeAdapter();
    authState.loading = true;
    authState.adapter = adapter;

    renderMockTable();
    // Give the effect every chance to run.
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(adapter.loadDraftByName).not.toHaveBeenCalled();
  });

  it('reads the in-progress key once auth resolves', async () => {
    const adapter = makeAdapter({
      loadDraftByName: jest.fn().mockResolvedValue(draftWith('Brett Favre')),
    });
    authState.adapter = adapter;

    renderMockTable();

    await waitFor(() => {
      expect(adapter.loadDraftByName).toHaveBeenCalledWith(LEAGUE_ID, IN_PROGRESS_KEY);
    });
    await waitFor(() => expect(qbSlotValue()).toBe('Brett Favre'));
  });

  it('clears state when the authoritative read finds nothing', async () => {
    // The exact regression. The first adapter (identity not yet known) yields a stale
    // local draft; the second (authoritative) has nothing, because an explicit save
    // deletes the in-progress key. Before the fix the success branch had no `else`, so
    // the stale selections stayed on screen — and were then autosaved back.
    const staleAdapter = makeAdapter({
      loadDraftByName: jest.fn().mockResolvedValue(draftWith('Marshall Faulk')),
    });
    authState.adapter = staleAdapter;

    const { rerender } = renderMockTable();
    await waitFor(() => expect(qbSlotValue()).toBe('Marshall Faulk'));

    const authoritativeAdapter = makeAdapter({
      loadDraftByName: jest.fn().mockResolvedValue(undefined),
    });
    authState.adapter = authoritativeAdapter;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <MockTable {...props} />
      </QueryClientProvider>
    );

    await waitFor(() => expect(authoritativeAdapter.loadDraftByName).toHaveBeenCalled());
    await waitFor(() => expect(qbSlotValue()).toBe(''));
  });

  it('does not autosave the superseded adapter\'s data after a swap', async () => {
    // The damaging half: state carried over from the pre-swap adapter used to be
    // written back through the new one, resurrecting weeks-old selections server-side.
    const staleAdapter = makeAdapter({
      loadDraftByName: jest.fn().mockResolvedValue(draftWith('Marshall Faulk')),
    });
    authState.adapter = staleAdapter;

    const { rerender } = renderMockTable();
    await waitFor(() => expect(qbSlotValue()).toBe('Marshall Faulk'));

    const authoritativeAdapter = makeAdapter({
      loadDraftByName: jest.fn().mockResolvedValue(undefined),
    });
    authState.adapter = authoritativeAdapter;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <MockTable {...props} />
      </QueryClientProvider>
    );

    // Well past the 500ms autosave debounce.
    await new Promise(resolve => setTimeout(resolve, 900));

    const saved = (authoritativeAdapter.saveSelectedRoster as jest.Mock).mock.calls;
    const resurrected = saved.some(call =>
      JSON.stringify(call).includes('Marshall Faulk')
    );
    expect(resurrected).toBe(false);
  });

  it('ignores a slow response from a superseded adapter', async () => {
    // The load effect re-runs on adapter swap; if the first read resolves after the
    // second, its result must be dropped rather than overwrite the newer one.
    let resolveSlow: (v: unknown) => void = () => {};
    const slowAdapter = makeAdapter({
      loadDraftByName: jest.fn().mockReturnValue(new Promise(resolve => { resolveSlow = resolve; })),
    });
    authState.adapter = slowAdapter;

    const { rerender } = renderMockTable();

    const authoritativeAdapter = makeAdapter({
      loadDraftByName: jest.fn().mockResolvedValue(undefined),
    });
    authState.adapter = authoritativeAdapter;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={queryClient}>
        <MockTable {...props} />
      </QueryClientProvider>
    );
    await waitFor(() => expect(authoritativeAdapter.loadDraftByName).toHaveBeenCalled());

    // The superseded read lands late, carrying stale data.
    resolveSlow(draftWith('Marshall Faulk'));
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(qbSlotValue()).toBe('');
  });
});
