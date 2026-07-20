'use client';
import { isLeagueId } from '@/platforms/common';
import ErrorScreen from '@/ui/ErrorScreen';
import LoadingScreen from '@/ui/LoadingScreen';
import { use, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/auth/context';
import { useLeagueInfoQuery } from '@/hooks/queries/useLeagueInfoQuery';
import { Card, CardBody } from '@/ui/Card';
import { Badge } from '@/ui/Badge';

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
                <div className="flex flex-1 flex-col items-center justify-center p-4 sm:p-12">
                    <Card className="max-w-2xl w-full">
                        <CardBody className="text-center space-y-4">
                            <div className="mb-2">
                                <Badge variant="accent" className="mb-4">Fantasy League</Badge>
                            </div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                                Welcome to {(leagueInfoQuery.data as any).name}!
                            </h1>
                            <p className="text-lg text-gray-600 dark:text-gray-400">
                                Use the links on the side to explore the previous auctions and plan for the next.
                            </p>
                            <div className="pt-4 flex justify-center gap-2">
                                <Badge variant="info">League ID: {leagueID}</Badge>
                            </div>
                        </CardBody>
                    </Card>
                </div>
            ) : null}
        </LoadingScreen>
    );
}
