'use client';
import { isLeagueId } from '@/platforms/common';
import ErrorScreen from '@/ui/ErrorScreen';
import LoadingScreen, { LoadingTask, QueryLoadingTask } from '@/ui/LoadingScreen';
import { use, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/auth/context';
import { useLeagueInfoQuery } from '@/hooks/queries/useLeagueInfoQuery';

export default function LeaguePage(props: Readonly<{ params: Promise<{ leagueID: string }> }>) {
    const params = use(props.params);
    const leagueID = params.leagueID;
    const { loading: authLoading } = useAuth();
    
    // Validate league ID
    if (!isLeagueId(leagueID)) {
        return <ErrorScreen message="Invalid league ID" />;
    }

    // Use React Query for data fetching
    const leagueInfoQuery = useLeagueInfoQuery(leagueID);

    // Track authLoading state with ref to avoid closure capture issue
    const authLoadingRef = useRef(authLoading);
    authLoadingRef.current = authLoading;

    // Create stable loading tasks
    const authTask = useMemo(() => 
        new LoadingTask(() => !authLoadingRef.current, 'Checking authentication...'), 
        []
    );

    const leagueTask = useMemo(() => 
        new QueryLoadingTask(leagueInfoQuery, 'Fetching League Information'), 
        [leagueInfoQuery]
    );

    // Combine all tasks into a stable Set
    const loadingTasks = useMemo(() => {
        return new Set([authTask, leagueTask]);
    }, [authTask, leagueTask]);

    // Handle query errors
    if (leagueInfoQuery.error) {
        const error = leagueInfoQuery.error as Error;
        return <ErrorScreen message={`Error loading league: ${error.message}`} />;
    }

    return (
        <LoadingScreen tasks={loadingTasks}>
            {leagueInfoQuery.data && (
                <div className="flex min-h-screen flex-col items-center p-12 m-auto">
                    <h1 className="text-2xl mb-4">Welcome to {leagueInfoQuery.data.name}!</h1>
                    <p>Use the links on the side to explore the previous auctions and plan for the next.</p>
                </div>
            )}
        </LoadingScreen>
    );
}
