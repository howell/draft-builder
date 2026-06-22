import { SeasonId } from "./platforms/common";

/**
 * Resolve the fantasy season we should be pulling draft data for, given a date.
 *
 * A fantasy season is named for the calendar year its NFL regular season starts
 * in (the "2026 season" kicks off Sept 2026 and finishes in Jan 2027). ESPN keeps
 * live draft/auction values populated for the upcoming/in-progress season and
 * zeroes them out once a season is fully complete — so for draft prep we always
 * want to point at the season people are actively drafting for.
 *
 * Convention: the season rolls over to the new calendar year in March, after the
 * prior season's Super Bowl and around the start of the new NFL league year.
 * January and February still belong to the previous season (the one just played).
 */
export function currentFantasySeason(now: Date = new Date()): SeasonId {
    const year = now.getFullYear();
    const month = now.getMonth(); // 0 = January
    return String(month <= 1 ? year - 1 : year);
}

// Allow pinning the season (e.g. for testing or to lock to a specific year)
// via an env var; otherwise derive it from the current date.
export const CURRENT_SEASON: SeasonId =
    process.env.NEXT_PUBLIC_FANTASY_SEASON || currentFantasySeason();

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