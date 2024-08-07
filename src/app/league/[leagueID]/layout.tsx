'use client';
import Sidebar from '../Sidebar';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ApiClient from '@/app/api/ApiClient';
import { CURRENT_SEASON } from '@/constants';

const LeagueLayout = ({ children, params } : { children: React.ReactNode, params: {leagueID: string, draftYear?: string } }) => {
    const leagueID = parseInt(params.leagueID);

    const [prevAuctions, setPrevAuctions] = useState<number[]>([]);
    const [leagueName, setLeagueName] = useState<string>('');
    const router = useRouter();

    useEffect(() => {
        const fetchData = async () => {
            try {
                const client = new ApiClient('espn', leagueID);
                const resp = await client.fetchLeagueHistory(CURRENT_SEASON);
                if (typeof resp === 'string') {
                    alert(`Failed to load league history: ${resp}`);
                    router.push('/');
                    return;
                }
                
                const leagueHistory = resp.data!;
                const auctions: number[] = [];
                for (const [year, info] of Object.entries(leagueHistory)) {
                    if (typeof info === 'number') {
                        console.error(`Failed to fetch league info for ${year}: ${info}`);
                    } else {
                        if (info.draftDetail.drafted && info.settings.draftSettings.type === 'AUCTION') {
                            auctions.push(parseInt(year));
                        }
                    }
                }

                setPrevAuctions(auctions);
                setLeagueName(leagueHistory[CURRENT_SEASON]!.settings.name);
            } catch (error: any) {
                alert(`Error while loading league history: ${error.message}`);
            } finally {
            }
        };

        fetchData();
    }, [leagueID]);

    return (
        <div>
            <Sidebar leagueID={leagueID}
                years={prevAuctions}
                leagueName={leagueName}
                availableLeagues={[]} />
            <main>{children}</main>
        </div>
    );
};

export default LeagueLayout;