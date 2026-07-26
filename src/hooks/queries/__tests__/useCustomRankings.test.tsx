/**
 * @jest-environment jsdom
 */

import React, { ReactNode } from 'react';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useCustomRankingsQuery,
  useSaveCustomRankingsMutation,
  useImportCustomRankingsMutation,
  useCustomRankingsIndexQuery,
  customRankingsKey,
  legacyCustomRankingsKey,
  loadCustomRankings,
  CrossPlatformCopyError,
} from '../useCustomRankings';
import { MemoryStorageAdapter } from '@/lib/storage/memory';
import type { StoredCustomRankings } from '@/types/customRankings';

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
const LEAGUE = '111';
const OTHER_LEAGUE = '222';
const SEASON = '2026';
const PRIOR_SEASON = '2025';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

// `waitFor` trips a container-type check under this repo's jest setup, so the
// existing hook tests settle via a timeout. Match that.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));

function board(overrides: Partial<StoredCustomRankings> = {}): StoredCustomRankings {
  return {
    schemaVersion: 1,
    leagueId: LEAGUE,
    platform: 'espn',
    season: SEASON,
    updated: 1,
    positions: { QB: [{ kind: 'player', playerId: 'a' }] },
    ...overrides,
  };
}

beforeEach(() => {
  adapter = new MemoryStorageAdapter();
  mockUseAuth.mockReturnValue({ user: TEST_USER, loading: false });
});

describe('useCustomRankingsQuery', () => {
  it('returns null when the league has no saved board', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCustomRankingsQuery(LEAGUE, SEASON), { wrapper });

    await settle();
    expect(result.current.data).toBeNull();
  });

  it('returns the stored board', async () => {
    const stored = board();
    await adapter.setUserSetting('app', customRankingsKey(LEAGUE, SEASON), stored);

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCustomRankingsQuery(LEAGUE, SEASON), { wrapper });

    await settle();
    expect(result.current.data).toEqual(stored);
  });

  it('keeps each league under its own key', async () => {
    await adapter.setUserSetting('app', customRankingsKey(OTHER_LEAGUE, SEASON), board({ leagueId: OTHER_LEAGUE }));

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCustomRankingsQuery(LEAGUE, SEASON), { wrapper });

    await settle();
    expect(result.current.data).toBeNull();
  });

  it('keeps each season under its own key', async () => {
    // Pools turn over yearly, so last season's board must not silently surface
    // as this season's.
    await adapter.setUserSetting(
      'app',
      customRankingsKey(LEAGUE, PRIOR_SEASON),
      board({ season: PRIOR_SEASON })
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCustomRankingsQuery(LEAGUE, SEASON), { wrapper });

    await settle();
    expect(result.current.data).toBeNull();
  });

  it('stays disabled without a league id', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCustomRankingsQuery(undefined, SEASON), { wrapper });

    await settle();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useSaveCustomRankingsMutation', () => {
  it('persists the board under the league key', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSaveCustomRankingsMutation(LEAGUE, SEASON), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        platform: 'espn',
        positions: { WR: [{ kind: 'player', playerId: 'w1' }] },
      });
    });

    const stored = await adapter.getUserSetting<StoredCustomRankings>('app', customRankingsKey(LEAGUE, SEASON));
    expect(stored?.positions.WR).toEqual([{ kind: 'player', playerId: 'w1' }]);
    expect(stored?.leagueId).toBe(LEAGUE);
    expect(stored?.schemaVersion).toBe(1);
  });

  it('overwrites rather than appending on repeated saves', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSaveCustomRankingsMutation(LEAGUE, SEASON), { wrapper });

    for (const playerId of ['a', 'b', 'c']) {
      await act(async () => {
        await result.current.mutateAsync({
          platform: 'espn',
          positions: { QB: [{ kind: 'player', playerId }] },
        });
      });
    }

    const stored = await adapter.getUserSetting<StoredCustomRankings>('app', customRankingsKey(LEAGUE, SEASON));
    expect(stored?.positions.QB).toEqual([{ kind: 'player', playerId: 'c' }]);
  });

  it('round-trips the hide-platform-rank preference', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSaveCustomRankingsMutation(LEAGUE, SEASON), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        platform: 'espn',
        positions: {},
        hidePlatformRank: true,
      });
    });

    const stored = await adapter.getUserSetting<StoredCustomRankings>('app', customRankingsKey(LEAGUE, SEASON));
    expect(stored?.hidePlatformRank).toBe(true);
  });
});

describe('useImportCustomRankingsMutation', () => {
  it('clones a same-platform board onto the target league', async () => {
    await adapter.setUserSetting(
      'app',
      customRankingsKey(OTHER_LEAGUE, SEASON),
      board({ leagueId: OTHER_LEAGUE, positions: { RB: [{ kind: 'player', playerId: 'r1' }] } })
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useImportCustomRankingsMutation(LEAGUE, SEASON, 'espn'), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sourceLeagueId: OTHER_LEAGUE, sourceSeason: SEASON });
    });

    const stored = await adapter.getUserSetting<StoredCustomRankings>('app', customRankingsKey(LEAGUE, SEASON));
    expect(stored?.positions.RB).toEqual([{ kind: 'player', playerId: 'r1' }]);
    expect(stored?.leagueId).toBe(LEAGUE);
  });

  it('imports an earlier season of the same league', async () => {
    await adapter.setUserSetting(
      'app',
      customRankingsKey(LEAGUE, PRIOR_SEASON),
      board({ season: PRIOR_SEASON, positions: { TE: [{ kind: 'player', playerId: 't1' }] } })
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useImportCustomRankingsMutation(LEAGUE, SEASON, 'espn'),
      { wrapper }
    );

    await act(async () => {
      await result.current.mutateAsync({ sourceLeagueId: LEAGUE, sourceSeason: PRIOR_SEASON });
    });

    const stored = await adapter.getUserSetting<StoredCustomRankings>(
      'app',
      customRankingsKey(LEAGUE, SEASON)
    );
    expect(stored?.positions.TE).toEqual([{ kind: 'player', playerId: 't1' }]);
    // Stamped as this season, not the source's.
    expect(stored?.season).toBe(SEASON);
    // The source is left intact.
    const source = await adapter.getUserSetting<StoredCustomRankings>(
      'app',
      customRankingsKey(LEAGUE, PRIOR_SEASON)
    );
    expect(source?.positions.TE).toEqual([{ kind: 'player', playerId: 't1' }]);
  });

  it('refuses a cross-platform copy instead of silently emptying the board', async () => {
    // ESPN and Sleeper ids share no namespace, so every player would be dropped
    // during reconciliation and the board would reset to a prefill.
    await adapter.setUserSetting(
      'app',
      customRankingsKey(OTHER_LEAGUE, SEASON),
      board({ leagueId: OTHER_LEAGUE, platform: 'sleeper' })
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useImportCustomRankingsMutation(LEAGUE, SEASON, 'espn'), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ sourceLeagueId: OTHER_LEAGUE, sourceSeason: SEASON });
      })
    ).rejects.toBeInstanceOf(CrossPlatformCopyError);

    expect(await adapter.getUserSetting('app', customRankingsKey(LEAGUE, SEASON))).toBeUndefined();
  });

  it('errors when the source league has no board', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useImportCustomRankingsMutation(LEAGUE, SEASON, 'espn'), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({ sourceLeagueId: OTHER_LEAGUE, sourceSeason: SEASON });
      })
    ).rejects.toThrow(/No saved rankings/);
  });
});

describe('useCustomRankingsIndexQuery', () => {
  it('lists only leagues that have a saved board, with player counts', async () => {
    await adapter.setUserSetting(
      'app',
      customRankingsKey(OTHER_LEAGUE, SEASON),
      board({
        leagueId: OTHER_LEAGUE,
        positions: {
          QB: [{ kind: 'player', playerId: 'a' }, { kind: 'tier', tierId: 'tier-1' }, { kind: 'player', playerId: 'b' }],
        },
      })
    );

    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useCustomRankingsIndexQuery([LEAGUE, OTHER_LEAGUE], [SEASON], true),
      { wrapper }
    );

    await settle();

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].leagueId).toBe(OTHER_LEAGUE);
    // Tier markers must not be counted as players.
    expect(result.current.data?.[0].counts.QB).toBe(2);
  });

  it('finds boards across both leagues and seasons, newest first', async () => {
    await adapter.setUserSetting(
      'app', customRankingsKey(LEAGUE, PRIOR_SEASON), board({ season: PRIOR_SEASON, updated: 1 }));
    await adapter.setUserSetting(
      'app', customRankingsKey(OTHER_LEAGUE, SEASON), board({ leagueId: OTHER_LEAGUE, updated: 5 }));

    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useCustomRankingsIndexQuery([LEAGUE, OTHER_LEAGUE], [SEASON, PRIOR_SEASON], true),
      { wrapper }
    );

    await settle();

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.map(e => [e.leagueId, e.season])).toEqual([
      [OTHER_LEAGUE, SEASON],
      [LEAGUE, PRIOR_SEASON],
    ]);
    expect(result.current.data?.[0].totalPlayers).toBe(1);
  });

  it('does not run until enabled', async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(
      () => useCustomRankingsIndexQuery([LEAGUE], [SEASON], false),
      { wrapper }
    );

    await settle();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('loadCustomRankings legacy adoption', () => {
  it('adopts a pre-season-scoping board and rewrites it under the scoped key', async () => {
    // That key shipped to production, so real browsers hold boards under it.
    await adapter.setUserSetting(
      'app',
      legacyCustomRankingsKey(LEAGUE),
      board({ season: SEASON, positions: { QB: [{ kind: 'player', playerId: 'a' }] } })
    );

    const loaded = await loadCustomRankings(adapter, LEAGUE, SEASON);

    expect(loaded?.positions.QB).toEqual([{ kind: 'player', playerId: 'a' }]);
    // Adopted, so the next read is a single hit on the scoped key.
    expect(await adapter.getUserSetting('app', customRankingsKey(LEAGUE, SEASON))).toBeDefined();
  });

  it('ignores a legacy board from a different season', async () => {
    // Otherwise every league would silently inherit last year's board on
    // rollover — the carry-forward season-scoping exists to prevent.
    await adapter.setUserSetting(
      'app',
      legacyCustomRankingsKey(LEAGUE),
      board({ season: PRIOR_SEASON, positions: { QB: [{ kind: 'player', playerId: 'a' }] } })
    );

    expect(await loadCustomRankings(adapter, LEAGUE, SEASON)).toBeNull();
    expect(await adapter.getUserSetting('app', customRankingsKey(LEAGUE, SEASON))).toBeUndefined();
  });

  it('ignores a legacy board with no players', async () => {
    await adapter.setUserSetting(
      'app',
      legacyCustomRankingsKey(LEAGUE),
      board({ season: SEASON, positions: { QB: [] } })
    );

    expect(await loadCustomRankings(adapter, LEAGUE, SEASON)).toBeNull();
  });

  it('never touches the legacy key once a scoped board exists', async () => {
    const scoped = board({ positions: { QB: [{ kind: 'player', playerId: 'scoped' }] } });
    await adapter.setUserSetting('app', customRankingsKey(LEAGUE, SEASON), scoped);
    await adapter.setUserSetting(
      'app',
      legacyCustomRankingsKey(LEAGUE),
      board({ season: SEASON, positions: { QB: [{ kind: 'player', playerId: 'legacy' }] } })
    );

    const reads: string[] = [];
    const spy = {
      getUserSetting: (type: any, key: string) => {
        reads.push(key);
        return adapter.getUserSetting(type, key);
      },
      setUserSetting: adapter.setUserSetting.bind(adapter),
    };

    const loaded = await loadCustomRankings(spy as any, LEAGUE, SEASON);

    expect(loaded?.positions.QB).toEqual([{ kind: 'player', playerId: 'scoped' }]);
    expect(reads).toEqual([customRankingsKey(LEAGUE, SEASON)]);
  });

  it('still returns the board when adopting it fails to write', async () => {
    await adapter.setUserSetting(
      'app',
      legacyCustomRankingsKey(LEAGUE),
      board({ season: SEASON, positions: { QB: [{ kind: 'player', playerId: 'a' }] } })
    );
    const failing = {
      getUserSetting: adapter.getUserSetting.bind(adapter),
      setUserSetting: () => Promise.reject(new Error('offline')),
    };

    // A failed adoption must never fail the read.
    const loaded = await loadCustomRankings(failing as any, LEAGUE, SEASON);
    expect(loaded?.positions.QB).toEqual([{ kind: 'player', playerId: 'a' }]);
  });

  it('does not write when adoption is disabled', async () => {
    await adapter.setUserSetting(
      'app',
      legacyCustomRankingsKey(LEAGUE),
      board({ season: SEASON, positions: { QB: [{ kind: 'player', playerId: 'a' }] } })
    );

    const loaded = await loadCustomRankings(adapter, LEAGUE, SEASON, { adopt: false });

    expect(loaded).not.toBeNull();
    expect(await adapter.getUserSetting('app', customRankingsKey(LEAGUE, SEASON))).toBeUndefined();
  });
});
