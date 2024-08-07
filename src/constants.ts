export const CURRENT_SEASON = 2024;

export const LINEUP_POSITION_ORDER = [
    'QB',
    'TQB',
    'OP',
    'SF',
    'RB',
    'WR',
    'TE',
    'FLEX',
    'RB/WR',
    'WR/TE',
    'RB/WR/TE',
    'K',
    'D/ST',
    'K',
    'Bench',
    'IR'
];

export function lineupOrder(position: string): number {
    switch (position) {
        case 'IR': return 10000;
        case 'Bench': return 1000;
        default:
            const idx = LINEUP_POSITION_ORDER.indexOf(position);
            if (idx === -1) {
                return 100;
            }
            return idx;
    }
}

export function compareLineupPositions(positionA: string, positionB: string): number {
    return lineupOrder(positionA) - lineupOrder(positionB);
}