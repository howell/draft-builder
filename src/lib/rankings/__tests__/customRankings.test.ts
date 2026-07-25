import {
  buildRankingPool,
  recentSeasons,
  resetPositions,
  prefillItems,
  reconcileItems,
  itemKey,
  moveItem,
  moveBy,
  insertTierBefore,
  removeTier,
  renameTier,
  nextTierId,
  toTierGroups,
  DEFAULT_POOL_LIMITS,
  type PoolPlayer,
} from '../customRankings';
import type { CustomRankingItem } from '@/types/customRankings';
import type { Player } from '@/platforms/PlatformApi';
import type { Rankings } from '@/types/storage';

function player(id: string, position: string, name = `Player ${id}`): Player {
  return {
    fullName: name,
    ids: { espn: id, sleeper: '', yahoo: '' },
    position,
    eligiblePositions: [position, 'BN'],
  };
}

/** Reference ranking where `order` lists ids best-first (rank 0 upward). */
function reference(order: string[]): Rankings {
  return {
    platform: 'espn',
    overall: new Map(order.map((id, i) => [id, i])),
    positional: new Map(),
  };
}

function pool(...ids: string[]): PoolPlayer[] {
  return ids.map((id, i) => ({ id, name: `Player ${id}`, position: 'WR' as const, platformRank: i + 1 }));
}

function players(...ids: string[]): CustomRankingItem[] {
  return ids.map(playerId => ({ kind: 'player', playerId }));
}

describe('buildRankingPool', () => {
  it('keeps only QB/RB/WR/TE and files each player under one position', () => {
    const input = [
      player('q', 'QB'),
      player('k', 'K'),
      player('d', 'D/ST'),
      player('w', 'WR'),
      player('x', 'DE'),
    ];

    const pools = buildRankingPool('espn', input, reference(['q', 'k', 'd', 'w', 'x']));

    expect(pools.QB.map(p => p.id)).toEqual(['q']);
    expect(pools.WR.map(p => p.id)).toEqual(['w']);
    expect(pools.RB).toEqual([]);
    expect(pools.TE).toEqual([]);
  });

  it('orders each position by the reference ranking', () => {
    const input = [player('a', 'WR'), player('b', 'WR'), player('c', 'WR')];

    const pools = buildRankingPool('espn', input, reference(['c', 'a', 'b']));

    expect(pools.WR.map(p => p.id)).toEqual(['c', 'a', 'b']);
  });

  it('exposes platform rank as 1-based for display', () => {
    const pools = buildRankingPool('espn', [player('a', 'WR')], reference(['a']));

    expect(pools.WR[0].platformRank).toBe(1);
  });

  it('drops players the reference ranking does not rank', () => {
    const input = [player('a', 'WR'), player('ghost', 'WR')];

    const pools = buildRankingPool('espn', input, reference(['a']));

    expect(pools.WR.map(p => p.id)).toEqual(['a']);
  });

  it('falls back to alphabetical order when there is no reference ranking', () => {
    // Happens when the Sleeper ADP sheet is unreachable. The board must stay
    // usable so an existing saved order is still readable.
    const input = [player('c', 'WR', 'Carl'), player('a', 'WR', 'Alice'), player('b', 'WR', 'Bob')];

    const pools = buildRankingPool('espn', input, undefined);

    expect(pools.WR.map(p => p.name)).toEqual(['Alice', 'Bob', 'Carl']);
    expect(pools.WR[0].platformRank).toBeUndefined();
  });

  it('caps each position independently', () => {
    const input = Array.from({ length: 200 }, (_, i) => player(`wr${i}`, 'WR'));

    const pools = buildRankingPool('espn', input, reference(input.map(p => p.ids.espn)));

    expect(pools.WR).toHaveLength(DEFAULT_POOL_LIMITS.WR);
    expect(pools.WR[0].id).toBe('wr0');
  });

  it('skips players with no id for the league platform', () => {
    const orphan = player('', 'WR');
    orphan.ids.espn = '';

    const pools = buildRankingPool('espn', [orphan], undefined);

    expect(pools.WR).toEqual([]);
  });

  it('tolerates a null position without throwing', () => {
    // ~240 Sleeper players carry position: null.
    const broken = { ...player('n', 'WR'), position: null as unknown as string };

    expect(() => buildRankingPool('espn', [broken], undefined)).not.toThrow();
  });

  it('does not mutate the array it is given', () => {
    // This is the players array held in the React Query cache.
    const input = [player('b', 'WR'), player('a', 'WR')];
    const order = input.map(p => p.ids.espn);

    buildRankingPool('espn', input, reference(['a', 'b']));

    expect(input.map(p => p.ids.espn)).toEqual(order);
  });
});

describe('reconcileItems', () => {
  it('prefills the whole pool when nothing is stored', () => {
    const result = reconcileItems(undefined, pool('a', 'b', 'c'));

    expect(result.items).toEqual(players('a', 'b', 'c'));
    expect(result.addedIds).toEqual([]);
    expect(result.removedIds).toEqual([]);
  });

  it('keeps the stored order rather than the pool order', () => {
    const stored = players('c', 'a', 'b');

    const result = reconcileItems(stored, pool('a', 'b', 'c'));

    expect(result.items).toEqual(stored);
  });

  it('drops players no longer in the pool and reports them', () => {
    const stored = players('a', 'retired', 'b');

    const result = reconcileItems(stored, pool('a', 'b'));

    expect(result.items).toEqual(players('a', 'b'));
    expect(result.removedIds).toEqual(['retired']);
  });

  it('appends new players at the end in reference order', () => {
    const stored = players('b');

    const result = reconcileItems(stored, pool('a', 'b', 'c'));

    expect(result.items).toEqual(players('b', 'a', 'c'));
    expect(result.addedIds).toEqual(['a', 'c']);
  });

  it('preserves tier markers and does not add one for new players', () => {
    const stored: CustomRankingItem[] = [
      { kind: 'player', playerId: 'a' },
      { kind: 'tier', tierId: 'tier-1' },
      { kind: 'player', playerId: 'b' },
    ];

    const result = reconcileItems(stored, pool('a', 'b', 'new'));

    expect(result.items).toEqual([...stored, { kind: 'player', playerId: 'new' }]);
    expect(result.items.filter(i => i.kind === 'tier')).toHaveLength(1);
  });

  it('keeps a tier marker whose players all disappeared', () => {
    const stored: CustomRankingItem[] = [
      { kind: 'tier', tierId: 'tier-1' },
      { kind: 'player', playerId: 'gone' },
    ];

    const result = reconcileItems(stored, pool('a'));

    expect(result.items).toEqual([
      { kind: 'tier', tierId: 'tier-1' },
      { kind: 'player', playerId: 'a' },
    ]);
  });

  it('is idempotent when nothing changed', () => {
    const first = reconcileItems(undefined, pool('a', 'b'));
    const second = reconcileItems(first.items, pool('a', 'b'));

    expect(second.items).toEqual(first.items);
    expect(second.addedIds).toEqual([]);
    expect(second.removedIds).toEqual([]);
  });

  it('de-duplicates a player listed twice in a corrupted blob', () => {
    // Duplicate dnd-kit ids make drags misbehave, so this must not survive.
    const result = reconcileItems(players('a', 'a', 'b'), pool('a', 'b'));

    expect(result.items).toEqual(players('a', 'b'));
  });
});

describe('moveItem', () => {
  it('moves a player to the target position', () => {
    const items = players('a', 'b', 'c');

    expect(moveItem(items, 'p:c', 'p:a')).toEqual(players('c', 'a', 'b'));
  });

  it('moves a player across a tier marker', () => {
    const items: CustomRankingItem[] = [
      { kind: 'player', playerId: 'a' },
      { kind: 'tier', tierId: 'tier-1' },
      { kind: 'player', playerId: 'b' },
    ];

    expect(moveItem(items, 'p:b', 't:tier-1')).toEqual([
      { kind: 'player', playerId: 'a' },
      { kind: 'player', playerId: 'b' },
      { kind: 'tier', tierId: 'tier-1' },
    ]);
  });

  it('moves a tier marker itself', () => {
    const items: CustomRankingItem[] = [
      { kind: 'player', playerId: 'a' },
      { kind: 'player', playerId: 'b' },
      { kind: 'tier', tierId: 'tier-1' },
    ];

    expect(moveItem(items, 't:tier-1', 'p:b')).toEqual([
      { kind: 'player', playerId: 'a' },
      { kind: 'tier', tierId: 'tier-1' },
      { kind: 'player', playerId: 'b' },
    ]);
  });

  it('is a no-op for the same key or an unknown key', () => {
    const items = players('a', 'b');

    expect(moveItem(items, 'p:a', 'p:a')).toBe(items);
    expect(moveItem(items, 'p:nope', 'p:a')).toBe(items);
    expect(moveItem(items, 'p:a', 'p:nope')).toBe(items);
  });
});

describe('moveBy', () => {
  it('moves an item up and down one slot', () => {
    const items = players('a', 'b', 'c');

    expect(moveBy(items, 'p:b', -1)).toEqual(players('b', 'a', 'c'));
    expect(moveBy(items, 'p:b', 1)).toEqual(players('a', 'c', 'b'));
  });

  it('clamps at both boundaries', () => {
    const items = players('a', 'b');

    expect(moveBy(items, 'p:a', -1)).toBe(items);
    expect(moveBy(items, 'p:b', 1)).toBe(items);
  });

  it('is a no-op for an unknown key', () => {
    const items = players('a');

    expect(moveBy(items, 'p:nope', 1)).toBe(items);
  });
});

describe('tier operations', () => {
  it('inserts a tier above the given row', () => {
    const items = players('a', 'b');

    expect(insertTierBefore(items, 'p:b')).toEqual([
      { kind: 'player', playerId: 'a' },
      { kind: 'tier', tierId: 'tier-1', label: undefined },
      { kind: 'player', playerId: 'b' },
    ]);
  });

  it('allocates unique ids even after a delete and re-add', () => {
    let items = insertTierBefore(players('a', 'b'), 'p:a');
    items = insertTierBefore(items, 'p:b');
    expect(items.filter(i => i.kind === 'tier').map(i => (i as any).tierId)).toEqual([
      'tier-1',
      'tier-2',
    ]);

    items = removeTier(items, 'tier-2');
    items = insertTierBefore(items, 'p:b');

    const ids = items.filter(i => i.kind === 'tier').map(i => (i as any).tierId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('merges a removed tier upward without touching players', () => {
    const items: CustomRankingItem[] = [
      { kind: 'player', playerId: 'a' },
      { kind: 'tier', tierId: 'tier-1' },
      { kind: 'player', playerId: 'b' },
    ];

    expect(removeTier(items, 'tier-1')).toEqual(players('a', 'b'));
  });

  it('renames only the targeted tier', () => {
    const items: CustomRankingItem[] = [
      { kind: 'tier', tierId: 'tier-1' },
      { kind: 'tier', tierId: 'tier-2' },
    ];

    const renamed = renameTier(items, 'tier-2', 'Value picks');

    expect(renamed).toEqual([
      { kind: 'tier', tierId: 'tier-1' },
      { kind: 'tier', tierId: 'tier-2', label: 'Value picks' },
    ]);
  });

  it('starts tier numbering from scratch on an empty board', () => {
    expect(nextTierId([])).toBe('tier-1');
  });
});

describe('toTierGroups', () => {
  const p = pool('a', 'b', 'c');

  it('renders an untiered board as a single unlabelled group', () => {
    const groups = toTierGroups(players('a', 'b'), p);

    expect(groups).toHaveLength(1);
    expect(groups[0].tierId).toBeNull();
    expect(groups[0].players.map(x => x.id)).toEqual(['a', 'b']);
  });

  it('emits a leading group only when players precede the first tier', () => {
    const leading = toTierGroups(
      [{ kind: 'player', playerId: 'a' }, { kind: 'tier', tierId: 'tier-1' }, { kind: 'player', playerId: 'b' }],
      p
    );
    expect(leading.map(g => g.tierId)).toEqual([null, 'tier-1']);

    const noLeading = toTierGroups(
      [{ kind: 'tier', tierId: 'tier-1' }, { kind: 'player', playerId: 'a' }],
      p
    );
    expect(noLeading.map(g => g.tierId)).toEqual(['tier-1']);
  });

  it('keeps an empty tier between two adjacent markers', () => {
    const groups = toTierGroups(
      [
        { kind: 'tier', tierId: 'tier-1' },
        { kind: 'tier', tierId: 'tier-2' },
        { kind: 'player', playerId: 'a' },
      ],
      p
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].players).toEqual([]);
    expect(groups[1].players.map(x => x.id)).toEqual(['a']);
  });

  it('keeps a trailing tier with no players', () => {
    const groups = toTierGroups(
      [{ kind: 'player', playerId: 'a' }, { kind: 'tier', tierId: 'tier-1' }],
      p
    );

    expect(groups[groups.length - 1].tierId).toBe('tier-1');
    expect(groups[groups.length - 1].players).toEqual([]);
  });

  it('numbers default labels by tier position and honours custom ones', () => {
    const groups = toTierGroups(
      [
        { kind: 'tier', tierId: 'tier-5' },
        { kind: 'player', playerId: 'a' },
        { kind: 'tier', tierId: 'tier-2', label: 'Sleepers' },
        { kind: 'player', playerId: 'b' },
      ],
      p
    );

    expect(groups.map(g => g.label)).toEqual(['Tier 1', 'Sleepers']);
  });

  it('ignores items for players missing from the pool', () => {
    const groups = toTierGroups(players('a', 'ghost'), p);

    expect(groups[0].players.map(x => x.id)).toEqual(['a']);
  });
});

describe('itemKey', () => {
  it('namespaces players and tiers so ids cannot collide', () => {
    expect(itemKey({ kind: 'player', playerId: '1' })).toBe('p:1');
    expect(itemKey({ kind: 'tier', tierId: '1' })).toBe('t:1');
  });
});

describe('prefillItems', () => {
  it('produces one player item per pooled player, in order', () => {
    expect(prefillItems(pool('a', 'b'))).toEqual(players('a', 'b'));
  });
});


describe('recentSeasons', () => {
  it('counts back from the current season, newest first', () => {
    expect(recentSeasons('2026', 4)).toEqual(['2026', '2025', '2024', '2023']);
  });

  it('falls back to just the current season when it is not numeric', () => {
    expect(recentSeasons('not-a-year')).toEqual(['not-a-year']);
  });
});

describe('resetPositions', () => {
  const pools = {
    QB: pool('q1', 'q2'),
    RB: pool('r1'),
    WR: [] as PoolPlayer[],
    TE: [] as PoolPlayer[],
  };

  it('restores platform order and drops tiers for the named positions', () => {
    const board = {
      QB: [
        { kind: 'player', playerId: 'q2' },
        { kind: 'tier', tierId: 'tier-1' },
        { kind: 'player', playerId: 'q1' },
      ] as CustomRankingItem[],
    };

    expect(resetPositions(board, pools, ['QB']).QB).toEqual(players('q1', 'q2'));
  });

  it('leaves positions it was not asked to reset alone', () => {
    const board = {
      QB: players('q2', 'q1'),
      RB: players('r1'),
    };

    const next = resetPositions(board, pools, ['QB']);

    expect(next.QB).toEqual(players('q1', 'q2'));
    expect(next.RB).toBe(board.RB);
  });

  it('resets every position when given all of them', () => {
    const board = { QB: players('q2', 'q1'), RB: [] as CustomRankingItem[] };

    const next = resetPositions(board, pools, ['QB', 'RB', 'WR', 'TE']);

    expect(next.QB).toEqual(players('q1', 'q2'));
    expect(next.RB).toEqual(players('r1'));
  });

  it('does not mutate the board it is given', () => {
    const board = { QB: players('q2', 'q1') };
    const before = board.QB;

    resetPositions(board, pools, ['QB']);

    expect(board.QB).toBe(before);
  });
});
