'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth/context';
import { LeagueId } from '../../platforms/common';
import LoadingScreen from '../../ui/LoadingScreen';
import ErrorScreen from '../../ui/ErrorScreen';
import { QuickActions } from './QuickActions';
import { RecentDrafts } from './RecentDrafts';
import UserProfile from '../auth/UserProfile';
import { useLeaguesQuery, useDraftsQuery } from '../../hooks/queries';
import { Card, CardHeader, CardTitle, CardBody } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';

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

  // Create loading dependencies using the new simplified API
  const loadingDependencies = useMemo(() => [
    { loading: authLoading, message: 'Authenticating...' },
    { query: leaguesQuery as any, message: 'Loading leagues...' },
    { query: draftsQuery as any, message: 'Loading drafts...' }
  ], [authLoading, leaguesQuery, draftsQuery]);

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
        <Card className="text-center">
          <CardTitle>Account Dashboard</CardTitle>
          <CardBody>
            <p className="text-gray-600 mb-6">
              You need to be signed in to view your dashboard.
            </p>
            <Button variant="primary" onClick={() => router.push('/auth')}>
              Sign In
            </Button>
          </CardBody>
        </Card>
      </div>
    );
  }

  // Handle errors
  if (error) {
    return (
      <div className={className}>
        <ErrorScreen message={error.message || 'Failed to load dashboard data'} />
        <div className="text-center mt-4">
          <Button 
            onClick={() => {
              leaguesQuery.refetch();
              draftsQuery.refetch();
            }}
            variant="primary"
          >
            Retry Loading Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <LoadingScreen waitFor={loadingDependencies}>
      <div className={`max-w-4xl mx-auto p-6 space-y-6 ${className}`}>
        {/* Welcome Header */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                Welcome back!
              </h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">
                {user.email}
              </p>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                <p>Member since</p>
                <p className="font-medium text-gray-700 dark:text-gray-300">
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
              <div className="bg-primary-50 rounded-lg p-4 border border-primary-200 dark:bg-primary-900/20 dark:border-primary-700">
                <h3 className="font-semibold text-primary-900 dark:text-primary-200 text-sm">Leagues</h3>
                <p className="text-2xl font-bold text-primary-700 dark:text-primary-300" data-testid="dashboard-league-count">{summary.leagueCount}</p>
              </div>
              <div className="bg-accent-50 rounded-lg p-4 border border-accent-200 dark:bg-accent-900/20 dark:border-accent-700">
                <h3 className="font-semibold text-accent-900 dark:text-accent-200 text-sm">Draft Sessions</h3>
                <p className="text-2xl font-bold text-accent-700 dark:text-accent-300" data-testid="dashboard-draft-count">{summary.draftCount}</p>
              </div>
              <div className="bg-secondary-50 rounded-lg p-4 border border-secondary-200 dark:bg-secondary-900/20 dark:border-secondary-700">
                <h3 className="font-semibold text-secondary-900 dark:text-secondary-200 text-sm">Player Selections</h3>
                <p className="text-2xl font-bold text-secondary-700 dark:text-secondary-300" data-testid="dashboard-selection-count">{summary.totalSelections}</p>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-200 dark:bg-orange-900/20 dark:border-orange-700">
                <h3 className="font-semibold text-orange-900 dark:text-orange-200 text-sm">Cost Adjustments</h3>
                <p className="text-2xl font-bold text-orange-700 dark:text-orange-300" data-testid="dashboard-adjustment-count">{summary.costAdjustments}</p>
              </div>
            </div>
          )}

          {/* Recent Activity */}
          {summary?.recentActivity && (
            <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Recent Activity</h3>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Last draft: <span className="font-medium text-gray-900 dark:text-gray-100">{summary.recentActivity.lastDraftName}</span>
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  League: <span className="font-medium text-gray-900 dark:text-gray-100">{summary.recentActivity.lastLeagueAccessed}</span>
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Updated: <span className="font-medium text-gray-900 dark:text-gray-100">
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
        </Card>

        {/* Quick Actions */}
        <QuickActions />
        
        {/* Recent Drafts */}
        <RecentDrafts summary={summary} />
      </div>
    </LoadingScreen>
  );
}