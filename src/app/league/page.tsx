'use server'
import { redirect } from 'next/navigation';

const ESPN_S2 = process.env.ESPN_S2
const ESPN_SWID = process.env.ESPN_SWID

export default async function Page({params, searchParams} : Readonly<{params: Record<string, string>, searchParams: {leagueID: string}}>) {
    const leagueID = parseInt(searchParams.leagueID);

    const leagueResponse = await fetch(buildLeagueInfoRoute(leagueID, 2023), {
        headers: {
            Cookie: `espn_s2=${ESPN_S2}; SWID=${ESPN_SWID}`
        }
    });
    if (leagueResponse.status !== 200) {
        redirect('/');
    }
    const leagueInfo = await leagueResponse.json();

    return (
        <div className="flex min-h-screen flex-col items-center justify-between p-24">
            <h1>Welcome to league {leagueInfo.settings.name}!</h1>
            <p>Here is some information about your league:</p>
            <pre>{JSON.stringify(leagueInfo, null, 2)}</pre>
        </div>
    );
}

function buildLeagueInfoRoute(leagueID: number, seasonID: number) {
    const baseURL = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/'; // 'https://fantasy.espn.com/apis/v3/games/ffl/seasons/';
    return `${baseURL}${seasonID}/segments/0/leagues/${leagueID}?view=mSettings`;
}