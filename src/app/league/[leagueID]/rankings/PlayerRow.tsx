'use client';

import React from 'react';
import { PositionBadge } from '@/ui/Badge';
import type { PoolPlayer } from '@/lib/rankings/customRankings';

export interface PlayerRowProps {
  player: PoolPlayer;
  /** 1-based position on the user's board. */
  ordinal: number;
  hidePlatformRank: boolean;
  referenceLabel: string;
  isNew: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onInsertTierAbove: () => void;
  /** Rendered by the sortable wrapper; plain rows leave it undefined. */
  dragHandle?: React.ReactNode;
}

const PlayerRow: React.FC<PlayerRowProps> = ({
  player,
  ordinal,
  hidePlatformRank,
  referenceLabel,
  isNew,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onInsertTierAbove,
  dragHandle,
}) => {
  return (
    <div
      role='listitem'
      data-testid={`ranking-row-${player.id}`}
      className='flex items-center gap-3 px-3 py-2 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 last:border-b-0'
    >
      {dragHandle}

      <span
        data-testid={`ranking-ordinal-${player.id}`}
        className='w-7 shrink-0 text-right text-sm font-semibold tabular-nums text-gray-500 dark:text-gray-400'
      >
        {ordinal}
      </span>

      <PositionBadge position={player.position} />

      <span className='flex-1 min-w-0 truncate text-gray-900 dark:text-gray-100'>
        {player.name}
        {isNew && (
          <span className='ml-2 text-xs font-medium text-accent-700 dark:text-accent-400'>
            new
          </span>
        )}
      </span>

      {/* Omitted entirely rather than visually hidden, so the accessibility tree
          and the visual layout agree about what is on screen. */}
      {!hidePlatformRank && player.platformRank !== undefined && (
        <span
          data-testid={`ranking-platform-rank-${player.id}`}
          className='shrink-0 text-sm tabular-nums text-gray-500 dark:text-gray-400'
        >
          {referenceLabel} {player.platformRank}
        </span>
      )}

      <div className='flex shrink-0 items-center gap-1'>
        <RowButton
          label={`Move ${player.name} up`}
          testId={`ranking-move-up-${player.id}`}
          disabled={!canMoveUp}
          onClick={onMoveUp}
        >
          ↑
        </RowButton>
        <RowButton
          label={`Move ${player.name} down`}
          testId={`ranking-move-down-${player.id}`}
          disabled={!canMoveDown}
          onClick={onMoveDown}
        >
          ↓
        </RowButton>
        <RowButton
          label={`Start a new tier above ${player.name}`}
          testId={`ranking-insert-tier-${player.id}`}
          onClick={onInsertTierAbove}
        >
          ＋
        </RowButton>
      </div>
    </div>
  );
};

const RowButton: React.FC<{
  label: string;
  testId: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ label, testId, disabled, onClick, children }) => (
  <button
    type='button'
    aria-label={label}
    title={label}
    data-testid={testId}
    disabled={disabled}
    onClick={onClick}
    className='w-7 h-7 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent'
  >
    {children}
  </button>
);

export default PlayerRow;
