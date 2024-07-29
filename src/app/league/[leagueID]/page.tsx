'use server'
import { fetchLeagueHistory, fetchLeagueInfo, } from '@/espn/league';
import { redirect } from 'next/navigation';

const DEFAULT_YEAR = 2023;

export default async function LeaguePage({ params }: Readonly<{ params: { leagueID: string } }>) {
    const leagueID = parseInt(params.leagueID);
    const leagueInfo = await fetchLeagueInfo(leagueID, DEFAULT_YEAR);
    if (typeof leagueInfo === 'number') {
        redirect('/');
    }

    return (
        <div className="container">
            <div className="flex min-h-screen flex-col items-center justify-between p-24">
                <h1>Welcome to league {leagueInfo.settings.name}!</h1>
                <p>Here is some information about your league:</p>
                <pre>{JSON.stringify(leagueInfo, null, 2)}</pre>
            </div>
        </div>
    );
}
