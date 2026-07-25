/**
 * Pure operations backing the custom positional rankings board.
 *
 * Deliberately free of React and of any app-router import. This repo's
 * `jest.setup.ts` replaces `global.window` with a stub, which breaks React 19's
 * value tracking and rules out meaningfully testing the drag surface in jsdom —
 * so the logic lives here, gets unit-tested directly, and the components stay
 * thin. See the Playwright specs for drag coverage.
 */

import type { Platform } from '@/platforms/common';
import type { Player, PlayerId } from '@/platforms/PlatformApi';
import type { Rankings } from '@/types/storage';
import {
  RANKABLE_POSITIONS,
  isRankablePosition,
  type CustomRankingItem,
  type RankablePosition,
} from '@/types/customRankings';

export type PoolPlayer = {
  id: PlayerId;
  name: string;
  position: RankablePosition;
  /** The platform's rank, 1-based for display. Undefined when unranked. */
  platformRank?: number;
};

export type TierGroup = {
  /** null for the implicit leading group before any tier marker. */
  tierId: string | null;
  label: string;
  players: PoolPlayer[];
};

export type PositionPools = Record<RankablePosition, PoolPlayer[]>;

/**
 * How deep each position's board goes.
 *
 * Per-position rather than one overall cap: an overall top-300 by rank yields
 * roughly fifteen tight ends, which is useless for a TE board. These are also
 * load-bearing for the drag surface — every row is a `useSortable` subscriber,
 * and ESPN returns up to 1000 players while Sleeper returns ~10k. Keeping each
 * list near 100 rows avoids needing virtualization, which combines badly with
 * sortable.
 */
export const DEFAULT_POOL_LIMITS: Record<RankablePosition, number> = {
  QB: 40,
  RB: 80,
  WR: 90,
  TE: 40,
};

function emptyPools(): PositionPools {
  return { QB: [], RB: [], WR: [], TE: [] };
}

/**
 * Build the per-position player pools, ordered by the reference ranking.
 *
 * Uses `player.position` rather than `eligiblePositions` so each player appears
 * on exactly one board — the mock draft needs multi-position eligibility for
 * lineup slotting, a positional board does not.
 */
export function buildRankingPool(
  platform: Platform,
  players: Player[],
  reference: Rankings | undefined,
  limits: Record<RankablePosition, number> = DEFAULT_POOL_LIMITS
): PositionPools {
  const pools = emptyPools();
  if (!players.length) {
    return pools;
  }

  const overall = reference?.overall;

  for (const player of players) {
    const position = player.position;
    if (!position || !isRankablePosition(position)) {
      continue;
    }
    const id = player.ids[platform];
    if (!id) {
      continue;
    }
    // When a reference ranking exists, it defines the pool: anything it does not
    // rank has no defensible place in a prefilled board.
    if (overall && !overall.has(id)) {
      continue;
    }
    pools[position].push({
      id,
      name: player.fullName,
      position,
      platformRank: overall ? (overall.get(id) as number) + 1 : undefined,
    });
  }

  for (const position of RANKABLE_POSITIONS) {
    pools[position].sort(comparePoolPlayers);
    pools[position] = pools[position].slice(0, limits[position]);
  }

  return pools;
}

function comparePoolPlayers(a: PoolPlayer, b: PoolPlayer): number {
  const aRank = a.platformRank ?? Number.MAX_SAFE_INTEGER;
  const bRank = b.platformRank ?? Number.MAX_SAFE_INTEGER;
  if (aRank !== bRank) {
    return aRank - bRank;
  }
  // Stable, meaningful fallback when there is no reference ranking at all.
  return a.name.localeCompare(b.name);
}

/** A fresh board: every pooled player, in reference order, no tiers. */
export function prefillItems(pool: PoolPlayer[]): CustomRankingItem[] {
  return pool.map(p => ({ kind: 'player', playerId: p.id }));
}

/** Stable dnd-kit id for an item. Players and tiers share one list. */
export function itemKey(item: CustomRankingItem): string {
  return item.kind === 'player' ? `p:${item.playerId}` : `t:${item.tierId}`;
}

export type ReconcileResult = {
  items: CustomRankingItem[];
  addedIds: PlayerId[];
  removedIds: PlayerId[];
};

/**
 * Merge a stored board with a freshly fetched pool.
 *
 * Players no longer in the pool are dropped; players not yet on the board are
 * appended in reference order. New arrivals deliberately do NOT get their own
 * tier marker — silently restructuring someone's tiers is worse than surfacing
 * "3 players added" and letting them place the players themselves.
 */
export function reconcileItems(
  stored: CustomRankingItem[] | undefined,
  pool: PoolPlayer[]
): ReconcileResult {
  if (!stored) {
    return { items: prefillItems(pool), addedIds: [], removedIds: [] };
  }

  const poolIds = new Set(pool.map(p => p.id));
  const seen = new Set<PlayerId>();
  const removedIds: PlayerId[] = [];

  const items = stored.filter(item => {
    if (item.kind === 'tier') {
      return true;
    }
    if (!poolIds.has(item.playerId)) {
      removedIds.push(item.playerId);
      return false;
    }
    // Guard against a corrupted blob listing the same player twice, which would
    // give dnd-kit duplicate ids and make drags misbehave.
    if (seen.has(item.playerId)) {
      return false;
    }
    seen.add(item.playerId);
    return true;
  });

  const addedIds = pool.filter(p => !seen.has(p.id)).map(p => p.id);
  const appended: CustomRankingItem[] = addedIds.map(playerId => ({ kind: 'player', playerId }));

  return { items: [...items, ...appended], addedIds, removedIds };
}

/** Next unused `tier-N` id. Deterministic so it is testable and SSR-safe. */
export function nextTierId(items: CustomRankingItem[]): string {
  let max = 0;
  for (const item of items) {
    if (item.kind !== 'tier') continue;
    const match = /^tier-(\d+)$/.exec(item.tierId);
    if (match) {
      max = Math.max(max, Number(match[1]));
    }
  }
  return `tier-${max + 1}`;
}

/** Move the item with `activeKey` to the position currently held by `overKey`. */
export function moveItem(
  items: CustomRankingItem[],
  activeKey: string,
  overKey: string
): CustomRankingItem[] {
  if (activeKey === overKey) {
    return items;
  }
  const from = items.findIndex(i => itemKey(i) === activeKey);
  const to = items.findIndex(i => itemKey(i) === overKey);
  if (from === -1 || to === -1) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Nudge an item one slot up or down. Backs the Move up / Move down buttons,
 * which are the mobile path, the screen-reader path, and the only reorder path
 * testable under jsdom.
 */
export function moveBy(
  items: CustomRankingItem[],
  key: string,
  delta: 1 | -1
): CustomRankingItem[] {
  const from = items.findIndex(i => itemKey(i) === key);
  if (from === -1) {
    return items;
  }
  const to = from + delta;
  if (to < 0 || to >= items.length) {
    return items;
  }
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Start a new tier immediately above `beforeKey`. */
export function insertTierBefore(
  items: CustomRankingItem[],
  beforeKey: string,
  label?: string
): CustomRankingItem[] {
  const index = items.findIndex(i => itemKey(i) === beforeKey);
  if (index === -1) {
    return items;
  }
  const next = [...items];
  next.splice(index, 0, { kind: 'tier', tierId: nextTierId(items), label });
  return next;
}

/** Remove a tier marker; its players merge into the preceding tier. */
export function removeTier(items: CustomRankingItem[], tierId: string): CustomRankingItem[] {
  return items.filter(i => !(i.kind === 'tier' && i.tierId === tierId));
}

export function renameTier(
  items: CustomRankingItem[],
  tierId: string,
  label: string
): CustomRankingItem[] {
  return items.map(i =>
    i.kind === 'tier' && i.tierId === tierId ? { ...i, label } : i
  );
}

/**
 * Fold the flat item list into render-ready tier groups.
 *
 * A leading group (tierId null) is emitted only when players appear before the
 * first marker, so a board with no tiers renders as one untitled list.
 */
export function toTierGroups(items: CustomRankingItem[], pool: PoolPlayer[]): TierGroup[] {
  const byId = new Map(pool.map(p => [p.id, p]));
  const groups: TierGroup[] = [];
  let current: TierGroup | null = null;
  let tierNumber = 0;

  for (const item of items) {
    if (item.kind === 'tier') {
      tierNumber += 1;
      current = {
        tierId: item.tierId,
        label: item.label?.trim() || `Tier ${tierNumber}`,
        players: [],
      };
      groups.push(current);
      continue;
    }

    const player = byId.get(item.playerId);
    if (!player) {
      continue;
    }
    if (!current) {
      current = { tierId: null, label: '', players: [] };
      groups.push(current);
    }
    current.players.push(player);
  }

  return groups;
}
