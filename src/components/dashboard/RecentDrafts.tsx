'use client';

import React, { useMemo } from 'react';
import { useAuth } from '../../lib/auth/context';
import { LeagueId } from '../../platforms/common';
import LoadingScreen from '../../ui/LoadingScreen';
import { useMockDraftsQuery, useLeaguesQuery } from '../../hooks/queries';

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

// Use the shared interface from the query hook
import type { MockDraft } from '../../hooks/queries/useMockDraftsQuery';

interface RecentDraftsProps {
  summary?: UserDataSummary | null;
}

export function RecentDrafts({ summary }: RecentDraftsProps) {
  const { loading: authLoading } = useAuth();
  
  // Use granular React Query hooks
  const leaguesQuery = useLeaguesQuery();
  const leagueIds = useMemo(() => {
    if (!leaguesQuery.data) return undefined;
    return Object.keys(leaguesQuery.data.leagues) as LeagueId[];
  }, [leaguesQuery.data]);
  
  const mockDraftsQuery = useMockDraftsQuery(leagueIds);
  
  // Filter to recent drafts (limit 5)
  const recentDrafts = useMemo(() => {
    if (!mockDraftsQuery.data) return [];
    return mockDraftsQuery.data.slice(0, 5);
  }, [mockDraftsQuery.data]);

  // Create loading dependencies using the new simplified API
  const loadingDependencies = useMemo(() => [
    { loading: authLoading, message: 'Authenticating...' },
    { query: mockDraftsQuery as any, message: 'Loading recent drafts...' }
  ], [authLoading, mockDraftsQuery]);
  
  const error = mockDraftsQuery.error;

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Drafts</h2>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Failed to load recent drafts: {error.message}</p>
          <button 
            onClick={() => mockDraftsQuery.refetch()}
            className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <LoadingScreen waitFor={loadingDependencies}>
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
            
            {recentDrafts.length === 5 && mockDraftsQuery.data && mockDraftsQuery.data.length > 5 && (
              <div className="text-center pt-4">
                <p className="text-sm text-gray-500">
                  Showing 5 of {mockDraftsQuery.data.length} total drafts
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </LoadingScreen>
  );
}