/**
 * Persisted shape for a user's own positional rankings.
 *
 * Stored as a JSON blob via `StorageAdapter.setUserSetting('app', ...)`, so
 * everything here must be plain JSON — note that `Rankings` in ./storage.ts uses
 * `Map`, which is NOT serializable and must never be persisted directly.
 */

import type { LeagueId, Platform, SeasonId } from '@/platforms/common';
import type { PlayerId } from '@/platforms/PlatformApi';

export const CUSTOM_RANKINGS_SCHEMA_VERSION = 1;

/** Positions a custom board covers. Deliberately excludes K/DST/FLEX. */
export const RANKABLE_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type RankablePosition = (typeof RANKABLE_POSITIONS)[number];

export function isRankablePosition(position: string): position is RankablePosition {
  return (RANKABLE_POSITIONS as readonly string[]).includes(position);
}

/**
 * One row of a board. Tier dividers are items in the same flat list as players
 * rather than containers holding them.
 *
 * This keeps the board a single sortable list — one `SortableContext`, one
 * `arrayMove` — instead of a multi-container drag surface, and makes it robust
 * to the player pool changing between sessions: reconciliation is a filter plus
 * a concat, and a tier marker can never be orphaned by the players around it
 * disappearing. A player belongs to the nearest preceding tier marker; players
 * before the first marker form an implicit leading group.
 */
export type CustomRankingItem =
  | { kind: 'player'; playerId: PlayerId }
  | { kind: 'tier'; tierId: string; label?: string };

export type CustomRankingsV1 = {
  schemaVersion: typeof CUSTOM_RANKINGS_SCHEMA_VERSION;
  leagueId: LeagueId;
  /**
   * Which platform's id namespace `playerId`s belong to. ESPN and Sleeper ids
   * share no namespace, so copying a board between leagues on different
   * platforms would drop every player; this is what lets us refuse that.
   */
  platform: Platform;
  /** Season the board was last written for; pools change on rollover. */
  season: SeasonId;
  updated: number;
  hidePlatformRank?: boolean;
  positions: Partial<Record<RankablePosition, CustomRankingItem[]>>;
};

export type StoredCustomRankings = CustomRankingsV1;
