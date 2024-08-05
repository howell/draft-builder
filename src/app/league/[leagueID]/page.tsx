'use client';
import ApiClient from '@/app/api/ApiClient';
import { FetchLeagueRequest, FetchLeagueResponse } from '@/app/api/fetch-league/interface';
import { FETCH_LEAGUE_ENDPOINT } from '@/app/api/interface';
import { makeApiRequest } from '@/app/api/utils';
import { leagueLineupSettings } from '@/espn/league';
import { useState, useEffect } from 'react';

const DEFAULT_YEAR = 2024;


export default function LeaguePage({ params }: Readonly<{ params: { leagueID: string } }>) {
    const leagueID = parseInt(params.leagueID);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [leagueInfo, setLeagueInfo] = useState<LeagueInfo | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const client = new ApiClient('espn', leagueID);
                const response = await client.fetchLeague(DEFAULT_YEAR);
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
        return (
            <div className="flex min-h-screen flex-col items-center justify-between p-24">
                <h1>Error loading league: {error}</h1>
            </div>);
    }
    if (loading) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-between p-24">
                <h1>Loading your league...</h1>
            </div>);

    }

    return (
        <div className="container">
            <div className="flex min-h-screen flex-col items-center justify-between p-24">
                <h1>Welcome to league {leagueInfo!.settings.name}!</h1>
                <p>Here is some information about your league:</p>
                <p>Lineup Settings:</p>
                <ul>
                    {Array.from(leagueLineupSettings(leagueInfo!)).map(([position, count]) => (
                        count > 0 ? <li key={position}>{position}: {count}</li> : null
                    ))}
                </ul>
                <pre>{JSON.stringify(leagueInfo, null, 2)}</pre>
            </div>
        </div>
    );
}
