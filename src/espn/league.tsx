import axios from "axios";
import { buildRoute } from "./api";
// import { cookies } from 'next/headers';


export type EspnAuth = {
    espnS2: string,
    swid: string
}

// export function loadAuthCookies() : EspnAuth | undefined {
//     const cooks = cookies();
//     const swid = cooks.get('swid');
//     const espnS2 = cooks.get('espn_s2');
//     return swid && espnS2 ? { swid: swid.value, espnS2: espnS2.value } : undefined;
// }

export function authCookies(auth?: EspnAuth): string {
    return `espn_s2=${auth?.espnS2 || ''}; SWID=${auth?.swid || ''}`;
}

export async function fetchLeagueInfo(leagueID: number, season: number, auth?: EspnAuth): Promise<number | LeagueInfo> {
    try {
        const leagueResponse = await axios.get(buildLeagueInfoRoute(leagueID, season), {
            headers: {
                Cookie: authCookies(auth)
            }
        });
        return leagueResponse.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            return error.response!.status
        }
        throw error;
    }
}

function buildLeagueInfoRoute(leagueID: number, seasonID: number) {
    return buildRoute(`${seasonID}/segments/0/leagues/${leagueID}`, '?view=mSettings');
}

export async function fetchLeagueHistory(leagueID: number, latestYear: number, auth?: EspnAuth): Promise<Map<number, LeagueInfo>> {
    const map = new Map<number, LeagueInfo>();
    const latestInfo = await fetchLeagueInfo(leagueID, latestYear, auth);
    if (typeof latestInfo === 'number') {
        return map;
    }
    map.set(latestYear, latestInfo);

    const historyResponse = await Promise.all(latestInfo.status.previousSeasons.map(async (season) => {
        const leagueResponse = await fetchLeagueInfo(leagueID, season, auth);
        return { season, leagueResponse };
    }));

    for (const { season, leagueResponse } of historyResponse) {
        if (typeof leagueResponse !== 'number') {
            map.set(season, leagueResponse);
        }
    }

    return map;
}

export async function fetchDraftInfo(leagueID: number, season: number, auth?: EspnAuth): Promise<number | DraftInfo> {
    try {
        const draftResponse = await axios.get(buildDraftRoute(leagueID, season), {
            headers: {
                Cookie: authCookies(auth)
            }
        });
        return draftResponse.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            return error.response!.status
        }
        throw error;
    }
}

function buildDraftRoute(leagueID: number, season: number, scoringPeriodId = 0) {
    return buildRoute(`${season}/segments/0/leagues/${leagueID}`,
        `?view=mDraftDetail&view=mMatchup&view=mMatchupScore&scoringPeriodId=${scoringPeriodId}`
    );
}

export async function fetchAllPlayerInfo(leagueID: number, season: number, scoringPeriodId = 0, maxPlayers = 1000, auth?: EspnAuth): Promise<number | PlayersInfo> {
    try {
        const playerResponse = await axios.get(buildPlayerRoute(leagueID, season, scoringPeriodId), {
            headers: {
                Cookie: authCookies(auth),
                'x-fantasy-filter': JSON.stringify({
                    players: {
                        limit: maxPlayers,
                        sortPercOwned: {
                            sortAsc: false,
                            sortPriority: 1
                        }
                    }
                })
            }
        });
        return playerResponse.data;

    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            return error.response!.status
        }
        throw error;
    }
}

function buildPlayerRoute(leagueID: number, season: number, scoringPeriodId = 0) {
    return buildRoute(`${season}/segments/0/leagues/${leagueID}`,
        `?scoringPeriodId=${scoringPeriodId}&view=kona_player_info`
    );
}

export async function fetchTeamsAtWeek(leagueID: number, season: number, scoringPeriodId: number, auth?: EspnAuth): Promise<number | TeamInfo> {
    try {
        const teamsResponse = await axios.get(buildTeamsRoute(leagueID, season, scoringPeriodId), {
            headers: {
                Cookie: authCookies(auth),
            }
        });
        return teamsResponse.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            return error.response!.status
        }
        throw error;
    }
}

function buildTeamsRoute(leagueID: number, season: number, scoringPeriodId: number) {
    return buildRoute(`${season}/segments/0/leagues/${leagueID}`,
        `?scoringPeriodId=${scoringPeriodId}&view=mRoster&view=mTeam`
    );
}

// source: https://github.com/mkreiser/ESPN-Fantasy-Football-API/blob/e73cb6f52b3620a83302f24a4d26fc9d8303bbbe/src/constants.js#L7C1-L34C3
export const slotCategoryIdToPositionMap: { [key: number]: string } = {
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

export type DraftedPlayer = DraftPick & PlayerInfo["player"] & { draftedBy: Team | number };

export function mergeDraftAndPlayerInfo(draftData: DraftPick[], playerData: PlayerInfo[], teams: Team[] = []): DraftedPlayer[] {
    return draftData.map((pick) => {
        const player = playerData.find((info: PlayerInfo) => info.player.id === pick.playerId);
        const team = teams.find((team: Team) => team.id === pick.teamId);
        if (!player) {
            console.error('Player not found for pick:', pick);
            throw new Error('Player not found for pick');
        }
        if (teams.length > 0 && !team) {
            console.error('Team not found for pick:', pick);
            throw new Error('Team not found for pick');
        }
        return {
            ...pick,
            ...player.player,
            draftedBy: team || pick.teamId
        };
    });
}