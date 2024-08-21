import { DraftPick, LeagueInfo, PlayerInfo, Team } from "./types";

export function slotName(slotId: number): string {
    return slotCategoryIdToPositionMap[slotId];
}

export function positionName(slotId: number): string {
    switch (slotId) {
        case 1: return 'QB';
        case 3: return 'WR';
        case 4: return 'TE';
        case 5: return 'K';
        default: return slotCategoryIdToPositionMap[slotId];
    }
}

// source: https://github.com/mkreiser/ESPN-Fantasy-Football-API/blob/e73cb6f52b3620a83302f24a4d26fc9d8303bbbe/src/constants.js#L7C1-L34C3
export const slotCategoryIdToPositionMap: { [key: number]: string; } = {
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
    const positionCounts: [string, number][] = Object.keys(slotCounts).map((slot: string) => [
        slotCategoryIdToPositionMap[parseInt(slot)],
        slotCounts[slot],
    ]);
    return new Map(positionCounts);
}

export type DraftedPlayer = DraftPick & PlayerInfo["player"] & { draftedBy: Team | number; };
