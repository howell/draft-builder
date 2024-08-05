'use client';
import Sidebar from '../Sidebar';
import { fetchLeagueHistory } from '@/espn/league';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { makeApiRequest } from '@/app/api/utils';
import { FetchLeagueHistoryRequest, FetchLeagueHistoryResponse } from '@/app/api/fetch-league-history/interface';
import { FetchDraftResponse } from '@/app/api/fetch-draft/interface';
import { FETCH_LEAGUE_HISTORY_ENDPOINT } from '@/app/api/interface';
import ApiClient from '@/app/api/ApiClient';

const DEFAULT_YEAR = 2024;

const LeagueLayout = ({ children, params } : { children: React.ReactNode, params: {leagueID: string, draftYear?: string } }) => {
    const leagueID = parseInt(params.leagueID);
    // const leagueHistory = await fetchLeagueHistory(leagueID, DEFAULT_YEAR, auth);

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
                // const leagueHistory = await fetchLeagueHistory(leagueID, DEFAULT_YEAR, auth);
                // const router = useRouter();
                // if (leagueHistory.size === 0) {
                //     console.log('League Layout: failed to load league history');
                //     console.log(auth);
                //     router.push('/');
                //     return;
                // }

                const leagueHistory = resp.data!;
                const auctions: number[] = [];
                for (const [year, info] of Object.entries(leagueHistory)) {
                    if (typeof info === 'number') {
                        console.error(`Failed to fetch league info for ${year}: ${info}`);
                    } else {
                        if (info.settings.draftSettings.type === 'AUCTION') {
                            auctions.push(parseInt(year));
                        }
                    }
                }

                setPrevAuctions(auctions);
                setLeagueName(leagueHistory[DEFAULT_YEAR]!.settings.name);
            } catch (error: any) {
                // setError(error.message);
            } finally {
                // setLoading(false);
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