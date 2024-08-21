'use client';
import ApiClient from '@/app/api/ApiClient';
import { loadLeague } from '@/app/localStorage';
import { CURRENT_SEASON } from '@/constants';
import { LeagueInfo } from '@/platforms/PlatformApi';
import ErrorScreen from '@/ui/ErrorScreen';
import LoadingScreen, { LoadingTasks } from '@/ui/LoadingScreen';
import { useState, useEffect } from 'react';

export default function LeaguePage({ params }: Readonly<{ params: { leagueID: string } }>) {
    const leagueID = parseInt(params.leagueID);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [leagueInfo, setLeagueInfo] = useState<LeagueInfo | null>(null);
    const [loadingTasks, setLoadingTasks] = useState<LoadingTasks>({});

    useEffect(() => {
        const fetchData = async () => {
            try {
                const league = loadLeague(leagueID);
                if (!league) {
                    setError('Could not load league; please try logging in again');
                    return;
                }
                const client = new ApiClient(league);
                const request = client.fetchLeague(CURRENT_SEASON);
                setLoadingTasks({ 'Fetching League': request });
                const response = await request;
                if (typeof response === 'string') {
                    setError(`Failed to load league: ${response}`);
                    return;
                }
                setLeagueInfo(response.data!);
            } catch (error: any) {
                setError(error.message);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [leagueID]);

    if (error) {
        return <ErrorScreen message={`Error loading league: ${error}`} />;
    }
    if (loading) {
        return <LoadingScreen tasks={loadingTasks} />;
    }

    return (
        <div className="flex min-h-screen flex-col items-center p-12 m-auto">
            <h1 className="text-2xl mb-4">Welcome to {leagueInfo!.name}!</h1>
            <p>Use the links on the side to explore the previous auctions and plan for the next.</p>
        </div>
    );
}
