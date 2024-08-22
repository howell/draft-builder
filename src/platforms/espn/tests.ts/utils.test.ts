import { LeagueInfo, Settings } from '../types';
import { leagueLineupSettings } from '../utils';

// Mock LeagueInfo
const mockLeagueInfo: LeagueInfo = {
    settings: {
        rosterSettings: {
            lineupSlotCounts: {
                '0': 1,
                '1': 0,
                '2': 2,
                '3': 0,
                '4': 3,
                '5': 0,
                '6': 1,
                '7': 1,
                '8': 0,
                '9': 0,
                '10': 0,
                '11': 0,
                '12': 0,
                '13': 0,
                '14': 0,
                '15': 0,
                '16': 1,
                '17': 0,
                '18': 0,
                '19': 0,
                '20': 7,
                '21': 1,
                '22': 0,
                '23': 1,
                '24': 0
            },
            isBenchUnlimited: false,
            isUsingUndroppableList: false,
            lineupLocktimeType: '',
            lineupSlotStatLimits: {},
            moveLimit: 0,
            positionLimits: {},
            rosterLocktimeType: '',
            universeIds: []
        },
        acquisitionSettings: {
            acquisitionBudget: 0,
            acquisitionLimit: 0,
            acquisitionType: '',
            finalPlaceTransactionEligible: 0,
            isUsingAcquisitionBudget: false,
            matchupAcquisitionLimit: 0,
            matchupLimitPerScoringPeriod: false,
            minimumBid: 0,
            transactionLockingEnabled: false,
            waiverHours: 0,
            waiverOrderReset: false,
            waiverProcessDays: [],
            waiverProcessHour: 0
        },
        draftSettings: {
            auctionBudget: 0,
            availableDate: 0,
            date: 0,
            isTradingEnabled: false,
            keeperCount: 0,
            keeperCountFuture: 0,
            keeperOrderType: '',
            leagueSubType: '',
            orderType: '',
            pickOrder: [],
            timePerSelection: 0,
            type: ''
        },
        financeSettings: {
            entryFee: 0,
            miscFee: 0,
            perLoss: 0,
            perTrade: 0,
            playerAcquisition: 0,
            playerDrop: 0,
            playerMoveToActive: 0,
            playerMoveToIR: 0
        },
        isCustomizable: false,
        isPublic: false,
        name: '',
        restrictionType: '',
        scheduleSettings: {
            divisions: [],
            matchupPeriodCount: 0,
            matchupPeriodLength: 0,
            matchupPeriods: {},
            periodTypeId: 0,
            playoffMatchupPeriodLength: 0,
            playoffReseed: false,
            playoffSeedingRule: '',
            playoffSeedingRuleBy: 0,
            playoffTeamCount: 0,
            variablePlayoffMatchupPeriodLength: false
        },
        scoringSettings: {
            allowOutOfPositionScoring: false,
            homeTeamBonus: 0,
            matchupTieRule: '',
            matchupTieRuleBy: 0,
            playerRankType: '',
            playoffHomeTeamBonus: 0,
            playoffMatchupTieRule: '',
            playoffMatchupTieRuleBy: 0,
            scoringItems: [],
            scoringType: 'STANDARD'
        },
        size: 0,
        tradeSettings: {
            allowOutOfUniverse: false,
            deadlineDate: 0,
            max: 0,
            revisionHours: 0,
            vetoVotesRequired: 0
        }
    },
    draftDetail: {
        drafted: false,
        inProgress: false
    },
    gameId: 0,
    id: 0,
    scoringPeriodId: 0,
    seasonId: 0,
    segmentId: 0,
    status: {
        activatedDate: 0,
        createdAsLeagueType: 0,
        currentLeagueType: 0,
        currentMatchupPeriod: 0,
        finalScoringPeriod: 0,
        firstScoringPeriod: 0,
        isActive: false,
        isExpired: false,
        isFull: false,
        isPlayoffMatchupEdited: false,
        isToBeDeleted: false,
        isViewable: false,
        isWaiverOrderEdited: false,
        latestScoringPeriod: 0,
        previousSeasons: [],
        standingsUpdateDate: 0,
        teamsJoined: 0,
        transactionScoringPeriod: 0,
        waiverLastExecutionDate: 0,
        waiverProcessStatus: {}
    }
};

describe('leagueLineupSettings', () => {
    it('should convert lineupSlotCounts to a Map with position names', () => {
        const result = leagueLineupSettings(mockLeagueInfo);
        const expected = new Map<string, number>([
            ['QB', 1],
            ['OP', 1],
            ['RB', 2],
            ['WR', 3],
            ['TE', 1],
            ['RB/WR/TE', 1],
            ['D/ST', 1],
            ['Bench', 7],
            ['IR', 1],
        ]);
        for (const [key, value] of Object.entries(result)) {
            expect(expected.has(key)).toEqual(value !== 0);
            expect(expected.get(key)).toEqual(value === 0 ? undefined : value);
        }
    });
});