'use client';

import React from 'react';

export interface TierDividerRowProps {
  tierId: string;
  /** The user's own name for this tier, if they have set one. */
  label?: string;
  /** Derived name shown when there is no user label, e.g. "Tier 2". */
  placeholder: string;
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
  placeholder,
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
      aria-label={`${label || placeholder}, ${playerCount} ${playerCount === 1 ? 'player' : 'players'}`}
      data-testid={`ranking-tier-${tierId}`}
      className='flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-900 border-y border-gray-300 dark:border-gray-600'
    >
      {dragHandle}

      {/*
        Controlled on the *stored* label, with the derived name only as a
        placeholder. An uncontrolled `defaultValue` latched the derived name on
        first render: because the row key is the stable tier id but the derived
        name is positional, deleting or reordering a tier renumbered every later
        tier while its input kept the old text — and the next blur wrote that
        stale text back into storage.
      */}
      <input
        aria-label={`Rename ${label || placeholder}`}
        data-testid={`ranking-tier-label-${tierId}`}
        value={label ?? ''}
        placeholder={placeholder}
        onChange={event => onRename(event.target.value)}
        className='flex-1 min-w-0 bg-transparent text-sm font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200 rounded px-1 py-0.5 hover:bg-white dark:hover:bg-gray-800 focus:bg-white dark:focus:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500'
      />

      <span className='shrink-0 text-xs text-gray-500 dark:text-gray-400 tabular-nums'>
        {playerCount}
      </span>

      <TierButton label={`Move ${label || placeholder} up`} testId={`ranking-tier-up-${tierId}`} disabled={!canMoveUp} onClick={onMoveUp}>
        ↑
      </TierButton>
      <TierButton label={`Move ${label || placeholder} down`} testId={`ranking-tier-down-${tierId}`} disabled={!canMoveDown} onClick={onMoveDown}>
        ↓
      </TierButton>
      <TierButton label={`Remove ${label || placeholder}`} testId={`ranking-tier-remove-${tierId}`} onClick={onRemove}>
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
