import axios from "axios";
import { LeagueInfo, DraftInfo, DraftPick, Players, LeagueUser } from "./types";

export const baseURL = 'https://api.sleeper.app/v1/';

export function buildRoute(route: any, params: any) : string{
    return `${baseURL}${route}${params}`;
}

export async function fetchLeagueInfo(leagueID: number): Promise<LeagueInfo | number> {
    const route = buildRoute(`league/${leagueID}`, '');
    try {
        const leagueResponse = await axios.get(route);
        return leagueResponse.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            return error.response!.status
        }
        throw error;
    }
}

export async function fetchLeagueHistory(leagueID: number): Promise<Map<number, LeagueInfo>> {
    const map = new Map<number, LeagueInfo>();
    const latestInfo = await fetchLeagueInfo(leagueID);
    if (typeof latestInfo === 'number') {
        return map;
    }
    map.set(parseInt(latestInfo.season), latestInfo);

    let league: LeagueInfo | number = latestInfo;
    while (league.previous_league_id && league.previous_league_id !== '') {
        league = await fetchLeagueInfo(parseInt(latestInfo.previous_league_id));
        if (typeof league === 'number') {
            break;
        }
        map.set(parseInt(league.season), league);
    }

    return map;
}

export async function fetchDraftInfo(draftId: number): Promise<number | DraftInfo> {
    const route = buildRoute(`draft/${draftId}`, '');
    try {
        const draftResponse = await axios.get(route);
        return draftResponse.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            return error.response!.status
        }
        throw error;
    }
}

export async function fetchDraftPicks(draftId: number): Promise<number | [DraftPick]> {
    const route = buildRoute(`draft/${draftId}/picks`, '');
    try {
        const draftResponse = await axios.get(route);
        return draftResponse.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            return error.response!.status
        }
        throw error;
    }
}

export async function fetchPlayers(): Promise<number | Players> {
    const route = buildRoute(`players/nfl`, '');
    try {
        const playersResponse = await axios.get(route);
        return playersResponse.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            return error.response!.status
        }
        throw error;
    }
}

export async function fetchUsers(leagueID: number): Promise<number | [LeagueUser]> {
    const route = buildRoute(`league/${leagueID}/users`, '');
    try {
        const teamsResponse = await axios.get(route);
        return teamsResponse.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            console.error("Issue fetching teams:", error);
            return error.response!.status
        }
        throw error;
    }
}