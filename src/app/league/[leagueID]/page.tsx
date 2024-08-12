'use client';
import ApiClient from '@/app/api/ApiClient';
import { loadLeague } from '@/app/localStorage';
import { compareLineupPositions, CURRENT_SEASON } from '@/constants';
import { leagueLineupSettings } from "@/platforms/espn/utils";
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
    }, []);

    if (error) {
        return <ErrorScreen message={`Error loading league: ${error}`} />;
    }
    if (loading) {
        return <LoadingScreen tasks={loadingTasks} />;
    }

    return (
        <div className="container">
            <div className="flex min-h-screen flex-col items-center justify-between p-24">
                <h1>Welcome to league {leagueInfo!.settings.name}!</h1>
                <p>Here is some information about your league:</p>
                <p>Lineup Settings:</p>
                <ul>
                    {Array.from(leagueLineupSettings(leagueInfo!))
                        .sort(([positionA, _cA], [positionB, _cB]) => compareLineupPositions(positionA, positionB))
                        .map(([position, count]) => (
                            count > 0 ? <li key={position}>{position}: {count}</li> : null
                        ))}
                </ul>
            </div>
        </div>
    );
}
