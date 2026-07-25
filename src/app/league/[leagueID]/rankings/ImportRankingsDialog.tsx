'use client';

import React from 'react';
import Button from '@/ui/Button';
import Alert from '@/ui/Alert';
import type { LeagueId, Platform, SeasonId } from '@/platforms/common';
import type { CustomRankingsSource } from '@/hooks/queries/useCustomRankings';
import { RANKABLE_POSITIONS } from '@/types/customRankings';

export interface ImportRankingsDialogProps {
  sources: CustomRankingsSource[] | undefined;
  loading: boolean;
  /** The board being imported into — excluded from the list. */
  targetLeagueId: LeagueId;
  targetSeason: SeasonId;
  targetPlatform: Platform;
  /** Whether the target already has a saved board, so we can warn before replacing. */
  targetHasBoard: boolean;
  importing: boolean;
  error?: string;
  onImport: (source: CustomRankingsSource) => void;
  onClose: () => void;
}

/**
 * Picker for cloning a previously saved board onto this one — from another
 * league, an earlier season, or both. Leagues are identified by id, which is how
 * the sidebar's league selector identifies them too; resolving names would mean
 * a league-history fetch per candidate.
 */
const ImportRankingsDialog: React.FC<ImportRankingsDialogProps> = ({
  sources,
  loading,
  targetLeagueId,
  targetSeason,
  targetPlatform,
  targetHasBoard,
  importing,
  error,
  onImport,
  onClose,
}) => {
  const importable = (sources ?? []).filter(
    s => !(s.leagueId === targetLeagueId && s.season === targetSeason)
  );
  // Player ids are platform-scoped, so a cross-platform import would drop every
  // player. Show those as disabled rather than hiding them, so the reason is
  // visible instead of the board just appearing to be missing.
  const sameplatform = importable.filter(s => s.platform === targetPlatform);
  const otherPlatform = importable.filter(s => s.platform !== targetPlatform);

  return (
    <div
      role='dialog'
      aria-modal='true'
      aria-label='Import rankings'
      data-testid='rankings-import-dialog'
      className='fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4'
      onClick={onClose}
    >
      <div
        className='w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-lg bg-white dark:bg-gray-800 shadow-xl p-5'
        onClick={event => event.stopPropagation()}
      >
        <h2 className='text-lg font-bold text-gray-900 dark:text-gray-100 mb-1'>
          Import rankings
        </h2>
        <p className='text-sm text-gray-600 dark:text-gray-400 mb-4'>
          Copy a board you have already built. Players this league does not carry are
          dropped, and any it has that the source lacks are added at the bottom in
          platform order.
        </p>

        {targetHasBoard && (
          <Alert variant='warning' className='mb-4'>
            This replaces your current rankings for {targetSeason}.
          </Alert>
        )}

        {error && (
          <Alert variant='error' className='mb-4'>
            {error}
          </Alert>
        )}

        {loading && (
          <p className='text-sm text-gray-500 dark:text-gray-400 py-6 text-center'>
            Looking for saved rankings…
          </p>
        )}

        {!loading && importable.length === 0 && (
          <p
            data-testid='rankings-import-empty'
            className='text-sm text-gray-500 dark:text-gray-400 py-6 text-center'
          >
            No other saved rankings to import yet. Once you build a board in another
            league or season, it will show up here.
          </p>
        )}

        {!loading && sameplatform.length > 0 && (
          <ul className='space-y-2'>
            {sameplatform.map(source => (
              <li key={`${source.leagueId}:${source.season}`}>
                <button
                  type='button'
                  disabled={importing}
                  data-testid={`rankings-import-source-${source.leagueId}-${source.season}`}
                  onClick={() => onImport(source)}
                  className='w-full text-left rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50'
                >
                  <span className='block font-medium text-gray-900 dark:text-gray-100'>
                    {source.leagueId === targetLeagueId
                      ? `${source.season} season`
                      : `League ${source.leagueId} · ${source.season}`}
                  </span>
                  <span className='block text-xs text-gray-500 dark:text-gray-400'>
                    {source.totalPlayers} players ·{' '}
                    {RANKABLE_POSITIONS.filter(p => source.counts[p]).map(
                      p => `${p} ${source.counts[p]}`
                    ).join(', ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {!loading && otherPlatform.length > 0 && (
          <p className='mt-4 text-xs text-gray-500 dark:text-gray-400'>
            {otherPlatform.length} other saved{' '}
            {otherPlatform.length === 1 ? 'board is' : 'boards are'} on a different
            platform and cannot be imported — player IDs are not shared between
            platforms.
          </p>
        )}

        <div className='mt-5 flex justify-end'>
          <Button variant='ghost' onClick={onClose} data-testid='rankings-import-cancel'>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ImportRankingsDialog;
