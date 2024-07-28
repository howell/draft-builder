'use server'
import { fetchLeagueHistory, fetchLeagueInfo, fetchDraftInfo } from '@/espn/league';
import { redirect } from 'next/navigation';
import Sidebar from '../Sidebar';

const DEFAULT_YEAR = 2023;

export default async function LeaguePage({ params }: Readonly<{ params: { leagueID: string } }>) {
    const leagueID = parseInt(params.leagueID);
    const leagueInfo = await fetchLeagueInfo(leagueID, DEFAULT_YEAR);
    if (typeof leagueInfo === 'number') {
        redirect('/');
    }

    const prevYears = await fetchLeagueHistory(leagueID, leagueInfo.status.previousSeasons);
    prevYears.set(DEFAULT_YEAR, leagueInfo);
    const prevAuctions = []
    for (const [year, info] of prevYears) {
        if (typeof info === 'number') {
            console.error(`Failed to fetch league info for ${year}: ${info}`);
        } else {
            if (info.settings.draftSettings.type === 'AUCTION') {
                prevAuctions.push(year);
            }
        }
    }
    return (
        <div className="container">
            <Sidebar leagueID = {leagueID} currentYear={DEFAULT_YEAR} years={prevAuctions} />
            <div className="flex min-h-screen flex-col items-center justify-between p-24">
                <h1>Welcome to league {leagueInfo.settings.name}!</h1>
                <p>Here is some information about your league:</p>
                <pre>{JSON.stringify(leagueInfo, null, 2)}</pre>
            </div>
        </div>
    );
}
