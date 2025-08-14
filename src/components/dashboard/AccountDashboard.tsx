'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth/context';
import { LeagueId } from '../../platforms/common';
import LoadingScreen, { LoadingTask, QueryLoadingTask } from '../../ui/LoadingScreen';
import ErrorScreen from '../../ui/ErrorScreen';
import { QuickActions } from './QuickActions';
import { RecentDrafts } from './RecentDrafts';
import UserProfile from '../auth/UserProfile';
import { useLeaguesQuery, useDraftsQuery } from '../../hooks/queries';

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
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  // Use granular React Query hooks
  const leaguesQuery = useLeaguesQuery();
  const leagueIds = useMemo(() => {
    if (!leaguesQuery.data) return undefined;
    return Object.keys(leaguesQuery.data.leagues) as LeagueId[];
  }, [leaguesQuery.data]);
  
  const draftsQuery = useDraftsQuery(leagueIds);
  
  // Track authLoading state with ref to avoid closure capture issue
  const authLoadingRef = React.useRef(authLoading);
  authLoadingRef.current = authLoading;

  // Component lifecycle logging
  console.log('[AccountDashboard] Component render with React Query - user:', user?.id || 'none', 'authLoading:', authLoading);

  // Calculate summary from query data using useMemo
  const summary = useMemo((): UserDataSummary | null => {
    if (!user || !leaguesQuery.data || !draftsQuery.data) {
      return null;
    }
    
    console.log('[AccountDashboard] Calculating summary from React Query data');
    
    const summary = {
      leagueCount: leagueIds?.length || 0,
      draftCount: draftsQuery.data.totalDrafts,
      totalSelections: draftsQuery.data.totalSelections,
      costAdjustments: draftsQuery.data.totalAdjustments,
      joinDate: user.created_at ? new Date(user.created_at) : new Date(),
      recentActivity: draftsQuery.data.mostRecentDraft ? {
        lastDraftDate: draftsQuery.data.mostRecentDraft.lastModified,
        lastDraftName: draftsQuery.data.mostRecentDraft.draftName,
        lastLeagueAccessed: draftsQuery.data.mostRecentDraft.leagueId,
      } : undefined,
    };
    
    console.log('[AccountDashboard] ✅ Summary calculated:', summary);
    return summary;
  }, [user, leaguesQuery.data, draftsQuery.data, leagueIds]);

  // Create stable loading tasks with individual useMemo to avoid re-creation
  const authTask = useMemo(() => 
    new LoadingTask(() => !authLoadingRef.current, 'Authenticating...'), 
    []
  );

  const leaguesTask = useMemo(() => 
    new QueryLoadingTask(leaguesQuery, 'Loading leagues...'), 
    [leaguesQuery]
  );

  const draftsTask = useMemo(() => 
    new QueryLoadingTask(draftsQuery, 'Loading drafts...'), 
    [draftsQuery]
  );

  // Combine all tasks into a stable Set
  const loadingTasks = useMemo(() => {
    const tasks = new Set([
      authTask,
      leaguesTask,
      draftsTask
    ]);
    console.log('[AccountDashboard] Created combined loading tasks:', tasks.size);
    return tasks;
  }, [authTask, leaguesTask, draftsTask]);

  // Handle query errors
  const error = leaguesQuery.error || draftsQuery.error;
  
  // Redirect unauthenticated users to home page
  React.useEffect(() => {
    console.log('[AccountDashboard] Auth redirect useEffect - authLoading:', authLoading, 'user:', user?.id || 'none');
    if (!authLoading && !user) {
      console.log('[AccountDashboard] Redirecting unauthenticated user to home');
      router.push('/');
    }
  }, [user, authLoading, router]);

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
        <ErrorScreen message={error.message || 'Failed to load dashboard data'} />
        <div className="text-center mt-4">
          <button 
            onClick={() => {
              leaguesQuery.refetch();
              draftsQuery.refetch();
            }}
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