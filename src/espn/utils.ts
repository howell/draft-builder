
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
};export function leagueLineupSettings(league: LeagueInfo): Map<string, number> {
    const slotCounts = league.settings.rosterSettings.lineupSlotCounts;
    const positionCounts: [string, number][] = Object.keys(slotCounts).map((slot: string) => [
        slotCategoryIdToPositionMap[parseInt(slot)],
        slotCounts[slot],
    ]);
    return new Map(positionCounts);
}

export type DraftedPlayer = DraftPick & PlayerInfo["player"] & { draftedBy: Team | number; };

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

