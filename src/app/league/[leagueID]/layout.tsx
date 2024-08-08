'use client';
import Sidebar from '../Sidebar';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ApiClient from '@/app/api/ApiClient';
import { CURRENT_SEASON } from '@/constants';
import { PlatformLeague } from '@/platforms/common';
import { loadLeagues } from '@/app/localStorage';

const LeagueLayout = ({ children, params } : { children: React.ReactNode, params: {leagueID: string, draftYear?: string } }) => {
    const leagueID = parseInt(params.leagueID);

    const [prevAuctions, setPrevAuctions] = useState<number[]>([]);
    const [leagueName, setLeagueName] = useState<string>('');
    const [availableLeagues, setAvailableLeagues] = useState<PlatformLeague[]>([]);
    const router = useRouter();

    useEffect(() => {
        const fetchData = async () => {
            try {
                const client = new ApiClient('espn', leagueID);
                const request = client.fetchLeagueHistory(CURRENT_SEASON);

                const availableLeagues = loadLeagues();
                setAvailableLeagues(Object.values(availableLeagues.leagues));

                const resp = await request;
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
                availableLeagues={availableLeagues} />
            <main>{children}</main>
        </div>
    );
};

export default LeagueLayout;