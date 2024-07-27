import { buildRoute } from "./api";


const ESPN_S2 = process.env.ESPN_S2
const ESPN_SWID = process.env.ESPN_SWID


export async function fetchLeagueInfo(leagueID: number, season: number): Promise<number | LeagueInfo> {
    const leagueResponse = await fetch(buildLeagueInfoRoute(leagueID, season), {
        headers: {
            Cookie: `espn_s2=${ESPN_S2}; SWID=${ESPN_SWID}`
        }
    });
    if (leagueResponse.status !== 200) {
        return leagueResponse.status;
    }
    return await leagueResponse.json();
}

function buildLeagueInfoRoute(leagueID: number, seasonID: number) {
    return buildRoute(`${seasonID}/segments/0/leagues/${leagueID}`, '?view=mSettings');
}