import { redirect } from 'next/navigation';
import Sidebar from '../Sidebar';
import { fetchLeagueHistory, fetchLeagueInfo } from '@/espn/league';

const DEFAULT_YEAR = 2023;

const LeagueLayout = async ({ children, params } : { children: React.ReactNode, params: {leagueID: string, draftYear?: string } }) => {
    const leagueID = parseInt(params.leagueID);
    const leagueHistory = await fetchLeagueHistory(leagueID, DEFAULT_YEAR);
    if (leagueHistory.size === 0) {
        redirect('/');
    }

    const prevAuctions = []
    for (const [year, info] of leagueHistory) {
        if (typeof info === 'number') {
            console.error(`Failed to fetch league info for ${year}: ${info}`);
        } else {
            if (info.settings.draftSettings.type === 'AUCTION') {
                prevAuctions.push(year);
            }
        }
    }

    return (
        <div>
            <Sidebar leagueID={leagueID}
                years={prevAuctions}
                leagueName={leagueHistory.get(DEFAULT_YEAR)!.settings.name} />
            <main>{children}</main>
        </div>
    );
};

export default LeagueLayout;