'use server'
import { fetchLeagueInfo } from '@/espn/league';
import { redirect } from 'next/navigation';

const DEFAULT_YEAR = 2023

export default async function Page({params, searchParams} : Readonly<{params: Record<string, string>, searchParams: {leagueID: string}}>) {
    const leagueID = parseInt(searchParams.leagueID);
    const leagueInfo = await fetchLeagueInfo(leagueID, DEFAULT_YEAR);
    if (typeof leagueInfo === 'number') {
        redirect('/');
    } else {
        redirect(`/league/${leagueID}`);
    }

    return <p>Redirecting...</p>;
}
