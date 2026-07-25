'use client';

import React from 'react';

export interface TierDividerRowProps {
  tierId: string;
  label: string;
  playerCount: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRename: (label: string) => void;
  onRemove: () => void;
  dragHandle?: React.ReactNode;
}

const TierDividerRow: React.FC<TierDividerRowProps> = ({
  tierId,
  label,
  playerCount,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRename,
  onRemove,
  dragHandle,
}) => {
  return (
    <div
      role='listitem'
      aria-label={`${label}, ${playerCount} ${playerCount === 1 ? 'player' : 'players'}`}
      data-testid={`ranking-tier-${tierId}`}
      className='flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-900 border-y border-gray-300 dark:border-gray-600'
    >
      {dragHandle}

      <input
        aria-label={`Rename ${label}`}
        data-testid={`ranking-tier-label-${tierId}`}
        defaultValue={label}
        onBlur={event => onRename(event.target.value)}
        className='flex-1 min-w-0 bg-transparent text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200 rounded px-1 py-0.5 hover:bg-white dark:hover:bg-gray-800 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500'
      />

      <span className='shrink-0 text-xs text-gray-500 dark:text-gray-400 tabular-nums'>
        {playerCount}
      </span>

      <TierButton label={`Move ${label} up`} testId={`ranking-tier-up-${tierId}`} disabled={!canMoveUp} onClick={onMoveUp}>
        ↑
      </TierButton>
      <TierButton label={`Move ${label} down`} testId={`ranking-tier-down-${tierId}`} disabled={!canMoveDown} onClick={onMoveDown}>
        ↓
      </TierButton>
      <TierButton label={`Remove ${label}`} testId={`ranking-tier-remove-${tierId}`} onClick={onRemove}>
        ✕
      </TierButton>
    </div>
  );
};

const TierButton: React.FC<{
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
    className='w-6 h-6 rounded text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent'
  >
    {children}
  </button>
);

export default TierDividerRow;
