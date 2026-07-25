'use client';

import React from 'react';
import Button from '@/ui/Button';
import Alert from '@/ui/Alert';
import { RANKABLE_POSITIONS, type RankablePosition } from '@/types/customRankings';

export interface ResetRankingsDialogProps {
  /** The position currently on screen, offered as the narrow reset. */
  position: RankablePosition;
  onReset: (positions: readonly RankablePosition[]) => void;
  onClose: () => void;
}

/**
 * Confirmation for discarding manual ordering back to platform order.
 *
 * Both scopes are offered explicitly rather than inferred: resetting one
 * position and resetting the whole board differ by a lot of lost work, so the
 * choice belongs in front of the user rather than behind a mode.
 */
const ResetRankingsDialog: React.FC<ResetRankingsDialogProps> = ({
  position,
  onReset,
  onClose,
}) => {
  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label='Reset rankings'
      data-testid='rankings-reset-dialog'
      className='fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4'
      onClick={onClose}
    >
      <div
        className='w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl p-5'
        onClick={event => event.stopPropagation()}
      >
        <h2 className='text-lg font-bold text-gray-900 dark:text-gray-100 mb-1'>
          Reset to platform rankings
        </h2>
        <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
          This restores the platform&apos;s order and removes any tiers you have added.
        </p>

        <Alert variant='warning' className='mb-4'>
          This cannot be undone.
        </Alert>

        <div className='flex flex-col gap-2'>
          <Button
            variant='outline'
            fullWidth
            data-testid='rankings-reset-position'
            onClick={() => onReset([position])}
          >
            Reset {position} only
          </Button>
          <Button
            variant='outline'
            fullWidth
            data-testid='rankings-reset-all'
            onClick={() => onReset(RANKABLE_POSITIONS)}
          >
            Reset all positions
          </Button>
        </div>

        <div className='mt-5 flex justify-end'>
          <Button variant='ghost' onClick={onClose} data-testid='rankings-reset-cancel'>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ResetRankingsDialog;
