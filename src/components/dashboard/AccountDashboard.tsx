'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth/context';
import { useStorageAdapter } from '../../lib/storage/hooks';
import { LeagueId } from '../../platforms/common';
import LoadingScreen, { LoadingTask, LoadingTasks } from '../../ui/LoadingScreen';
import ErrorScreen from '../../ui/ErrorScreen';
import { QuickActions } from './QuickActions';
import { RecentDrafts } from './RecentDrafts';
import UserProfile from '../auth/UserProfile';

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

interface AccountDashboardProps {
  className?: string;
}

export function AccountDashboard({ className = "" }: AccountDashboardProps) {
  const { user, loading } = useAuth();
  const storageAdapter = useStorageAdapter();
  const router = useRouter();
  const [summary, setSummary] = useState<UserDataSummary | null>(null);
  const [loadingTasks, setLoadingTasks] = useState<LoadingTasks>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadUserDataSummaryAsync = useCallback(async () => {
    if (!user) throw new Error('User not authenticated');

    // Load leagues data
    const leagues = await storageAdapter.loadLeagues();
    const leagueIds = Object.keys(leagues.leagues) as LeagueId[];
    
    let totalDrafts = 0;
    let totalSelections = 0;
    let totalAdjustments = 0;
    let lastDraftDate: Date | undefined;
    let lastDraftName: string | undefined;
    let lastLeagueAccessed: string | undefined;
    
    // Process each league and its drafts
    for (const leagueId of leagueIds) {
      try {
        const mocks = await storageAdapter.loadSavedMocks(leagueId);
        const draftNames = Object.keys(mocks);
        totalDrafts += draftNames.length;
        
        // Process each draft
        for (const draftName of draftNames) {
          const draft = mocks[draftName];
          
          // Count selections and adjustments
          totalSelections += Object.keys(draft.rosterSelections).length;
          totalAdjustments += Object.keys(draft.costAdjustments || {}).length;
          
          // Track most recent draft
          const draftModified = new Date(draft.modified);
          if (!lastDraftDate || draftModified > lastDraftDate) {
            lastDraftDate = draftModified;
            lastDraftName = draftName;
            lastLeagueAccessed = leagueId;
          }
        }
      } catch (draftError) {
        console.warn(`Failed to load drafts for league ${leagueId}:`, draftError);
        // Continue processing other leagues even if one fails
      }
    }
    
    setSummary({
      leagueCount: leagueIds.length,
      draftCount: totalDrafts,
      totalSelections,
      costAdjustments: totalAdjustments,
      joinDate: user.created_at ? new Date(user.created_at) : new Date(),
      recentActivity: lastDraftDate ? {
        lastDraftDate,
        lastDraftName,
        lastLeagueAccessed,
      } : undefined,
    });

    setLoadingTasks(new Set());
  }, [user, storageAdapter, setSummary, setLoadingTasks]);

  const loadUserDataSummary = useCallback(async () => {
    if (!user) return;

    try {
      setError(null);
      const loadingTask = new LoadingTask(
        loadUserDataSummaryAsync(),
        'Loading your dashboard data...'
      );
      setLoadingTasks(new Set([loadingTask]));
      
      // Monitor for task completion and errors
      const checkTaskStatus = () => {
        if (loadingTask.isFinished()) {
          if (loadingTask.hasError()) {
            const error = loadingTask.getError();
            console.error('Failed to load user data summary:', error);
            setError(error?.message || 'Failed to load dashboard data');
          }
          setLoadingTasks(new Set());
        } else {
          // Check again in a bit if not finished
          setTimeout(checkTaskStatus, 100);
        }
      };
      
      // Start monitoring
      setTimeout(checkTaskStatus, 100);
    } catch (error) {
      console.error('Failed to load user data summary:', error);
      setError(error instanceof Error ? error.message : 'Failed to load dashboard data');
      setLoadingTasks(new Set());
    }
  }, [user, loadUserDataSummaryAsync, setError, setLoadingTasks]);

  useEffect(() => {
    if (user) {
      loadUserDataSummary();
    }
  }, [user, loadUserDataSummary]);

  // Redirect unauthenticated users to home page
  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  // Handle unauthenticated users
  if (!user) {
    return (
      <div className={`max-w-4xl mx-auto p-6 ${className}`}>
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Account Dashboard</h2>
          <p className="text-gray-600 mb-4">
            You need to be signed in to view your dashboard.
          </p>
          <a 
            href="/auth" 
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  // Handle errors
  if (error) {
    return (
      <div className={className}>
        <ErrorScreen message={error} />
        <div className="text-center mt-4">
          <button 
            onClick={loadUserDataSummary}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Retry Loading Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <LoadingScreen tasks={loadingTasks}>
      <div className={`max-w-4xl mx-auto p-6 space-y-6 ${className}`}>
        {/* Welcome Header */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Welcome back!
              </h1>
              <p className="text-gray-600 mt-1">
                {user.email}
              </p>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-right text-sm text-gray-500">
                <p>Member since</p>
                <p className="font-medium text-gray-700">
                  {summary?.joinDate.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
              <UserProfile showEmail={false} compact={true} />
            </div>
          </div>
          
          {/* Data Summary Cards */}
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <h3 className="font-semibold text-blue-900 text-sm">Leagues</h3>
                <p className="text-2xl font-bold text-blue-700" data-testid="dashboard-league-count">{summary.leagueCount}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                <h3 className="font-semibold text-green-900 text-sm">Draft Sessions</h3>
                <p className="text-2xl font-bold text-green-700" data-testid="dashboard-draft-count">{summary.draftCount}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                <h3 className="font-semibold text-purple-900 text-sm">Player Selections</h3>
                <p className="text-2xl font-bold text-purple-700" data-testid="dashboard-selection-count">{summary.totalSelections}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                <h3 className="font-semibold text-orange-900 text-sm">Cost Adjustments</h3>
                <p className="text-2xl font-bold text-orange-700" data-testid="dashboard-adjustment-count">{summary.costAdjustments}</p>
              </div>
            </div>
          )}

          {/* Recent Activity */}
          {summary?.recentActivity && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Recent Activity</h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">
                  Last draft: <span className="font-medium text-gray-900">{summary.recentActivity.lastDraftName}</span>
                </p>
                <p className="text-sm text-gray-600">
                  League: <span className="font-medium text-gray-900">{summary.recentActivity.lastLeagueAccessed}</span>
                </p>
                <p className="text-sm text-gray-600">
                  Updated: <span className="font-medium text-gray-900">
                    {summary.recentActivity.lastDraftDate?.toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'short', 
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <QuickActions />
        
        {/* Recent Drafts */}
        <RecentDrafts summary={summary} />
      </div>
    </LoadingScreen>
  );
}