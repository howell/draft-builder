'use client';

import React from 'react';
import type { RankablePosition } from '@/types/customRankings';
import { getPositionBadgeClasses } from '@/styles/design-system';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface RankingsToolbarProps {
  positions: readonly RankablePosition[];
  selectedPosition: RankablePosition;
  onSelectPosition: (position: RankablePosition) => void;
  hidePlatformRank: boolean;
  onToggleHidePlatformRank: () => void;
  hasReferenceRanking: boolean;
  referenceLabel: string;
  saveState: SaveState;
}

const SAVE_LABELS: Record<SaveState, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Not saved',
};

/**
 * Position picker plus board-level controls.
 *
 * Not built on `TabContainer`: that component owns its selected index
 * internally and exposes no value/onChange, so it cannot drive the parent state
 * the board needs.
 */
const RankingsToolbar: React.FC<RankingsToolbarProps> = ({
  positions,
  selectedPosition,
  onSelectPosition,
  hidePlatformRank,
  onToggleHidePlatformRank,
  hasReferenceRanking,
  referenceLabel,
  saveState,
}) => {
  return (
    <div className='flex flex-wrap items-center gap-3 mb-4'>
      <div role='tablist' aria-label='Position' className='flex gap-1'>
        {positions.map(position => {
          const selected = position === selectedPosition;
          return (
            <button
              key={position}
              role='tab'
              type='button'
              aria-selected={selected}
              data-testid={`rankings-position-${position}`}
              onClick={() => onSelectPosition(position)}
              className={`px-3 py-1.5 rounded-md text-sm font-semibold border transition-colors ${
                selected
                  ? `${getPositionBadgeClasses(position)} border-transparent ring-2 ring-offset-1 ring-primary-500 dark:ring-offset-gray-900`
                  : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {position}
            </button>
          );
        })}
      </div>

      <div className='flex items-center gap-4 ml-auto'>
        {hasReferenceRanking && (
          <button
            type='button'
            role='switch'
            aria-checked={hidePlatformRank}
            data-testid='rankings-hide-platform-rank'
            onClick={onToggleHidePlatformRank}
            className='flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100'
          >
            <span
              aria-hidden='true'
              className={`w-9 h-5 rounded-full transition-colors relative ${
                hidePlatformRank ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                  hidePlatformRank ? 'left-[1.125rem]' : 'left-0.5'
                }`}
              />
            </span>
            Hide {referenceLabel}
          </button>
        )}

        <span
          aria-live='polite'
          data-testid='rankings-save-state'
          className={`text-sm min-w-[4.5rem] ${
            saveState === 'error'
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {SAVE_LABELS[saveState]}
        </span>
      </div>
    </div>
  );
};

export default RankingsToolbar;
