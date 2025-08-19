'use client';
import { isLeagueId } from '@/platforms/common';
import ErrorScreen from '@/ui/ErrorScreen';
import LoadingScreen from '@/ui/LoadingScreen';
import { use, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/auth/context';
import { useLeagueInfoQuery } from '@/hooks/queries/useLeagueInfoQuery';

export default function LeaguePage(props: Readonly<{ params: Promise<{ leagueID: string }> }>) {
    const params = use(props.params);
    const leagueID = params.leagueID;
    const { loading: authLoading } = useAuth();

    // Use React Query for data fetching (even if leagueID is invalid)
    const leagueInfoQuery = useLeagueInfoQuery(leagueID);

    // Create loading dependencies using the new simplified API
    const loadingDependencies = useMemo(() => [
        { loading: authLoading, message: 'Checking authentication...' },
        { query: leagueInfoQuery as any, message: 'Fetching League Information' }
    ], [authLoading, leagueInfoQuery]);
    
    // Validate league ID AFTER all hooks
    if (!isLeagueId(leagueID)) {
        return <ErrorScreen message="Invalid league ID" />;
    }

    // Handle query errors
    if (leagueInfoQuery.error) {
        const error = leagueInfoQuery.error as Error;
        return <ErrorScreen message={`Error loading league: ${error.message}`} />;
    }

    return (
        <LoadingScreen waitFor={loadingDependencies}>
            {leagueInfoQuery.data && 
             typeof leagueInfoQuery.data === 'object' && 
             'name' in leagueInfoQuery.data ? (
                <div className="flex min-h-screen flex-col items-center p-12 m-auto">
                    <h1 className="text-2xl mb-4">Welcome to {(leagueInfoQuery.data as any).name}!</h1>
                    <p>Use the links on the side to explore the previous auctions and plan for the next.</p>
                </div>
            ) : null}
        </LoadingScreen>
    );
}
