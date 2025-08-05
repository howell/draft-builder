'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useStorageAdapter } from '../../lib/storage/hooks';
import { LeagueId } from '../../platforms/common';
import LoadingScreen, { LoadingTask, LoadingTasks } from '../../ui/LoadingScreen';

interface UserDataSummary {
  leagueCount: number;
  draftCount: number;
  totalSelections: number;
  costAdjustments: number;
  joinDate: Date;
  recentActivity?: {
    lastDraftDate?: Date;
    lastDraftName?: string;
    lastLeagueAccessed?: string;
  };
}

interface RecentDraft {
  draftName: string;
  leagueName: string;
  leagueId: LeagueId;
  lastModified: Date;
  selectionCount: number;
  adjustmentCount: number;
}

interface RecentDraftsProps {
  summary?: UserDataSummary | null;
}

export function RecentDrafts({ summary }: RecentDraftsProps) {
  const storageAdapter = useStorageAdapter();
  const [recentDrafts, setRecentDrafts] = useState<RecentDraft[]>([]);
  const [loadingTasks, setLoadingTasks] = useState<LoadingTasks>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadRecentDraftsAsync = useCallback(async () => {
    const leagues = await storageAdapter.loadLeagues();
    const drafts: RecentDraft[] = [];

    for (const [leagueId, league] of Object.entries(leagues.leagues)) {
      try {
        const mocks = await storageAdapter.loadSavedMocks(leagueId as LeagueId);
        
        for (const [draftName, draft] of Object.entries(mocks)) {
          drafts.push({
            draftName,
            leagueName: leagueId,
            leagueId: leagueId as LeagueId,
            lastModified: new Date(draft.modified),
            selectionCount: Object.keys(draft.rosterSelections).length,
            adjustmentCount: Object.keys(draft.costAdjustments || {}).length,
          });
        }
      } catch (draftError) {
        console.warn(`Failed to load drafts for league ${leagueId}:`, draftError);
      }
    }

    // Sort by last modified, most recent first
    drafts.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
    
    // Take only the 5 most recent
    setRecentDrafts(drafts.slice(0, 5));
    setLoadingTasks(new Set());
  }, [storageAdapter, setRecentDrafts, setLoadingTasks]);

  const loadRecentDrafts = useCallback(async () => {
    try {
      setError(null);
      const loadingTask = new LoadingTask(
        loadRecentDraftsAsync(),
        'Loading recent drafts...'
      );
      setLoadingTasks(new Set([loadingTask]));
    } catch (error) {
      console.error('Failed to load recent drafts:', error);
      setError(error instanceof Error ? error.message : 'Failed to load recent drafts');
      setLoadingTasks(new Set());
    }
  }, [loadRecentDraftsAsync, setError, setLoadingTasks]);

  useEffect(() => {
    loadRecentDrafts();
  }, [loadRecentDrafts]);

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Drafts</h2>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Failed to load recent drafts: {error}</p>
          <button 
            onClick={loadRecentDrafts}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <LoadingScreen tasks={loadingTasks}>
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Drafts</h2>
        
        {summary && summary.draftCount === 0 ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">📝</div>
            <p className="text-gray-600 mb-4">
              You haven&apos;t created any drafts yet.
            </p>
            <a 
              href="/"
              className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Create Your First Draft
            </a>
          </div>
        ) : recentDrafts.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No recent drafts found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentDrafts.map((draft, index) => (
              <div 
                key={`${draft.leagueId}-${draft.draftName}`}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex-1">
                  <h3 className="font-medium text-gray-900">{draft.draftName}</h3>
                  <p className="text-sm text-gray-600">{draft.leagueName}</p>
                  <p className="text-xs text-gray-500">
                    Last updated: {draft.lastModified.toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
                <div className="text-right text-sm text-gray-600">
                  <p>{draft.selectionCount} selections</p>
                  {draft.adjustmentCount > 0 && (
                    <p>{draft.adjustmentCount} adjustments</p>
                  )}
                </div>
              </div>
            ))}
            
            {recentDrafts.length === 5 && summary && summary.draftCount > 5 && (
              <div className="text-center pt-4">
                <p className="text-sm text-gray-500">
                  Showing 5 of {summary.draftCount} total drafts
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </LoadingScreen>
  );
}