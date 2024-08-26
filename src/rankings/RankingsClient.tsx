import { ScoringType } from "@/platforms/PlatformApi";
import { getLatestAdpRanks, headerFor } from "./sources/sleeper";
import { Ranking } from '@/app/savedMockTypes';

export default class RankingsClient {
    private scoringType: ScoringType;

    constructor(scoringType: ScoringType) {
        this.scoringType = scoringType;
    }

    public async fetchRanks(): Promise<Ranking[] | undefined> {
        if (this.scoringType === 'standard') {
            return undefined;
        }
        const sleeperRanks = await getLatestAdpRanks();
        const sleeperScoringRanks = sleeperRanks.get(this.scoringType)!;
        return [{
            name: 'Sleeper ' + headerFor(this.scoringType),
            shortName: 'Sleeper ADP',
            value: sleeperScoringRanks
        }]
    }
}