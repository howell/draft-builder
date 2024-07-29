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

export async function fetchLeagueHistory(leagueID: number, latestYear: number): Promise<Map<number, LeagueInfo>> {
    const map = new Map<number, LeagueInfo>();
    const latestInfo = await fetchLeagueInfo(leagueID, latestYear);
    if (typeof latestInfo === 'number') {
        return map;
    }
    map.set(latestYear, latestInfo);

    const historyResponse = await Promise.all(latestInfo.status.previousSeasons.map(async (season) => {
        const leagueResponse = await fetchLeagueInfo(leagueID, season); 
        return {season, leagueResponse};
    }));

    for (const {season, leagueResponse} of historyResponse) {
        if (typeof leagueResponse !== 'number') {
            map.set(season, leagueResponse);
        }
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

// source: https://github.com/mkreiser/ESPN-Fantasy-Football-API/blob/e73cb6f52b3620a83302f24a4d26fc9d8303bbbe/src/constants.js#L7C1-L34C3
export const slotCategoryIdToPositionMap: { [key: number] : string } = {
    0: 'QB',
    1: 'TQB',
    2: 'RB',
    3: 'RB/WR',
    4: 'WR',
    5: 'WR/TE',
    6: 'TE',
    7: 'OP',
    8: 'DT',
    9: 'DE',
    10: 'LB',
    11: 'DL',
    12: 'CB',
    13: 'S',
    14: 'DB',
    15: 'DP',
    16: 'D/ST',
    17: 'K',
    18: 'P',
    19: 'HC',
    20: 'Bench',
    21: 'IR',
    22: 'INVALID_CODE', // https://github.com/cwendt94/espn-api/blob/master/espn_api/football/constant.py#L24
    23: 'RB/WR/TE',
    24: 'ER',
    25: 'Rookie'
  };

export function leagueLineupSettings(league: LeagueInfo): Map<string, number> {
    const slotCounts = league.settings.rosterSettings.lineupSlotCounts;
    const positionCounts: [string, number][] = Object.keys(slotCounts).map((slot: string) =>
        [
            slotCategoryIdToPositionMap[parseInt(slot)],
            slotCounts[slot],
        ]);
    return new Map(positionCounts);
}
