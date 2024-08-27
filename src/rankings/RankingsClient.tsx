import { ScoringType } from "@/platforms/PlatformApi";
import { getLatestAdpRanks, headerFor } from "./sources/sleeper";
import { Ranking } from '@/app/savedMockTypes';
import { SleeperScoringAdp } from "./types";
import { PlatformLeague } from "@/platforms/common";

export default class RankingsClient {
    private league: PlatformLeague;
    private scoringType: ScoringType;

    constructor(league: PlatformLeague, scoringType: ScoringType) {
        this.league = league;
        this.scoringType = scoringType;
    }

    public async fetchRanks(): Promise<Ranking[] | undefined> {
        if (this.league.platform !== 'sleeper') {
            return;
        }
        const sleeperRanks = await getLatestAdpRanks();
        const ranks: Ranking[] = [];
        for (const [scoring, ranking] of sleeperRanks) {
            ranks.push({
                name: 'Sleeper ' + headerFor(scoring),
                shortName: 'Sleeper ADP',
                tooltip: 'Average Draft Position from Sleeper, https://sleeper.app/',
                value: ranking
            });
        }
        const sleeperScoring: SleeperScoringAdp = this.scoringType === 'standard' ? 'half-ppr' : this.scoringType;
        const scoringTypeRanking = ranks.find(ranking => ranking.name === 'Sleeper ' + headerFor(sleeperScoring));
        if (scoringTypeRanking) {
            ranks.splice(ranks.indexOf(scoringTypeRanking), 1);
            ranks.unshift(scoringTypeRanking);
        }
        return ranks;
    }
}