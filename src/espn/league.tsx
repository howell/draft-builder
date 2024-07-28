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

export async function fetchLeagueHistory(leagueID: number, seasons: number[]): Promise<Map<number, number | LeagueInfo>> {
    const map = new Map<number, number | LeagueInfo>();
    for (const season of seasons) {
        const leagueResponse = await fetchLeagueInfo(leagueID, season); 
        map.set(season, leagueResponse);
    }
    return map;
}

export async function fetchDraftInfo(leagueID: number, season: number): Promise<number | DraftInfo> {
    const draftResponse = await fetch(buildDraftRoute(leagueID, season), {
        headers: {
            Cookie: `espn_s2=${ESPN_S2}; SWID=${ESPN_SWID}`
        }
    });
    if (draftResponse.status !== 200) {
        return draftResponse.status;
    }
    return await draftResponse.json();
}

function buildDraftRoute(leagueID: number, season: number, scoringPeriodId = 0) {
    return buildRoute(`${season}/segments/0/leagues/${leagueID}`,
        `?view=mDraftDetail&view=mMatchup&view=mMatchupScore&scoringPeriodId=${scoringPeriodId}`
     );
}

export async function fetchAllPlayerInfo(leagueID: number, season: number, scoringPeriodId = 0): Promise<number | PlayersInfo> {
    const playerResponse = await fetch(buildPlayerRoute(leagueID, season, scoringPeriodId), {
        headers: {
            Cookie: `espn_s2=${ESPN_S2}; SWID=${ESPN_SWID}`,
            'x-fantasy-filter': JSON.stringify({
                players: {
                    limit: 3000,
                    sortPercOwned: {
                        sortAsc: false,
                        sortPriority: 1
                    }
                }
            })
        }
    });
    if (playerResponse.status !== 200) {
        return playerResponse.status;
    }
    return await playerResponse.json();
}

function buildPlayerRoute(leagueID: number, season: number, scoringPeriodId = 0) {
    return buildRoute(`${season}/segments/0/leagues/${leagueID}`,
        `?scoringPeriodId=${scoringPeriodId}&view=kona_player_info`
    );
}

export async function fetchTeamsAtWeek(leagueID: number, season: number, scoringPeriodId: number): Promise<number | TeamInfo> {
    const teamsResponse = await fetch(buildTeamsRoute(leagueID, season, scoringPeriodId), {
        headers: {
            Cookie: `espn_s2=${ESPN_S2}; SWID=${ESPN_SWID}`
        }
    });
    if (teamsResponse.status !== 200) {
        return teamsResponse.status;
    }
    return await teamsResponse.json();
}

function buildTeamsRoute(leagueID: number, season: number, scoringPeriodId: number) {
    return buildRoute(`${season}/segments/0/leagues/${leagueID}`,
        `?scoringPeriodId=${scoringPeriodId}&view=mRoster&view=mTeam`
    );
}