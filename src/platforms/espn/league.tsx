import axios from "axios";
import { buildRoute } from "./api";
import { DraftInfo, LeagueInfo, PlayersInfo, TeamInfo } from "./types";
import { LeagueId, SeasonId } from "../common";


export type EspnAuth = {
    espnS2: string,
    swid: string
}

export function authCookies(auth?: EspnAuth): string {
    return `espn_s2=${auth?.espnS2 || ''}; SWID=${auth?.swid || ''}`;
}

export async function fetchLeagueInfo(leagueID: LeagueId, season: SeasonId, auth?: EspnAuth): Promise<number | LeagueInfo> {
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

function buildLeagueInfoRoute(leagueID: LeagueId, seasonID: SeasonId) {
    return buildRoute(`${seasonID}/segments/0/leagues/${leagueID}`, '?view=mSettings');
}

export async function fetchLeagueHistory(leagueID: LeagueId, latestYear: SeasonId, auth?: EspnAuth): Promise<Map<SeasonId, LeagueInfo>> {
    const map = new Map<SeasonId, LeagueInfo>();
    const latestInfo = await fetchLeagueInfo(leagueID, latestYear, auth);
    if (typeof latestInfo === 'number') {
        return map;
    }
    map.set(latestYear, latestInfo);

    const historyResponse = await Promise.all(latestInfo.status.previousSeasons.map(async (season) => {
        const leagueResponse = await fetchLeagueInfo(leagueID, season.toString(), auth);
        return { season: season.toString(), leagueResponse };
    }));

    for (const { season, leagueResponse } of historyResponse) {
        if (typeof leagueResponse !== 'number') {
            map.set(season, leagueResponse);
        }
    }

    return map;
}

export async function fetchDraftInfo(leagueID: LeagueId, season: SeasonId, auth?: EspnAuth): Promise<number | DraftInfo> {
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

function buildDraftRoute(leagueID: LeagueId, season: SeasonId, scoringPeriodId = 0) {
    return buildRoute(`${season}/segments/0/leagues/${leagueID}`,
        `?view=mDraftDetail&view=mMatchup&view=mMatchupScore&scoringPeriodId=${scoringPeriodId}`
    );
}

export async function fetchAllPlayerInfo(leagueID: LeagueId, season: SeasonId, auth?: EspnAuth, scoringPeriodId = 0, maxPlayers = 1000): Promise<number | PlayersInfo> {
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

function buildPlayerRoute(leagueID: LeagueId, season: SeasonId, scoringPeriodId = 0) {
    return buildRoute(`${season}/segments/0/leagues/${leagueID}`,
        `?scoringPeriodId=${scoringPeriodId}&view=kona_player_info`
    );
}

export async function fetchTeamsAtWeek(leagueID: LeagueId, season: SeasonId, scoringPeriodId: number, auth?: EspnAuth): Promise<number | TeamInfo> {
    try {
        const teamsResponse = await axios.get(buildTeamsRoute(leagueID, season, scoringPeriodId), {
            headers: {
                Cookie: authCookies(auth),
            }
        });
        return teamsResponse.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            console.error("Issue fetching teams:", error);
            return error.response!.status
        }
        throw error;
    }
}

function buildTeamsRoute(leagueID: LeagueId, season: SeasonId, scoringPeriodId: number) {
    return buildRoute(`${season}/segments/0/leagues/${leagueID}`,
        `?scoringPeriodId=${scoringPeriodId}&view=mRoster&view=mTeam`
    );
}

