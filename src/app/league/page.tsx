'use server'
import { fetchLeagueInfo } from '@/espn/league';
import { redirect } from 'next/navigation';

const DEFAULT_YEAR = 2023

export default async function Page({params, searchParams} : Readonly<{params: Record<string, string>, searchParams: {leagueID: string}}>) {
    const leagueID = parseInt(searchParams.leagueID);
    const leagueInfo = await fetchLeagueInfo(leagueID, DEFAULT_YEAR);
    if (typeof leagueInfo === 'number') {
        redirect('/');
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-between p-24">
            <h1>Welcome to league {leagueInfo.settings.name}!</h1>
            <p>Here is some information about your league:</p>
            <pre>{JSON.stringify(leagueInfo, null, 2)}</pre>
        </div>
    );
}
