'use client';
import Sidebar from '../Sidebar';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import ApiClient from '@/app/api/ApiClient';

const DEFAULT_YEAR = 2024;

const LeagueLayout = ({ children, params } : { children: React.ReactNode, params: {leagueID: string, draftYear?: string } }) => {
    const leagueID = parseInt(params.leagueID);

    const [prevAuctions, setPrevAuctions] = useState<number[]>([]);
    const [leagueName, setLeagueName] = useState<string>('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const client = new ApiClient('espn', leagueID);
                const resp = await client.fetchLeagueHistory(DEFAULT_YEAR);
                if (typeof resp === 'string') {
                    alert(`Failed to load league history: ${resp}`);
                    useRouter().push('/');
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
                setLeagueName(leagueHistory[DEFAULT_YEAR]!.settings.name);
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
                leagueName={leagueName} />
            <main>{children}</main>
        </div>
    );
};

export default LeagueLayout;