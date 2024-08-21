export type LeagueInfo = {
    draftDetail: DraftDetail;
    gameId: number;
    id: number;
    scoringPeriodId: number;
    seasonId: number;
    segmentId: number;
    settings: Settings;
    status: Status;
};

export type Settings = {
    acquisitionSettings: AcquisitionSettings;
    draftSettings: DraftSettings;
    financeSettings: FinanceSettings;
    isCustomizable: boolean;
    isPublic: boolean;
    name: string;
    restrictionType: string;
    rosterSettings: RosterSettings;
    scheduleSettings: ScheduleSettings;
    scoringSettings: ScoringSettings;
    size: number;
    tradeSettings: TradeSettings;
};

export type Status = {
    activatedDate: number;
    createdAsLeagueType: number;
    currentLeagueType: number;
    currentMatchupPeriod: number;
    finalScoringPeriod: number;
    firstScoringPeriod: number;
    isActive: boolean;
    isExpired: boolean;
    isFull: boolean;
    isPlayoffMatchupEdited: boolean;
    isToBeDeleted: boolean;
    isViewable: boolean;
    isWaiverOrderEdited: boolean;
    latestScoringPeriod: number;
    previousSeasons: number[];
    standingsUpdateDate: number;
    teamsJoined: number;
    transactionScoringPeriod: number;
    waiverLastExecutionDate: number;
    waiverProcessStatus: { [key: string]: number };
};

export type DraftDetail = {
    drafted: boolean;
    inProgress: boolean;
};

export type AcquisitionSettings = {
    acquisitionBudget: number;
    acquisitionLimit: number;
    acquisitionType: string;
    finalPlaceTransactionEligible: number;
    isUsingAcquisitionBudget: boolean;
    matchupAcquisitionLimit: number;
    matchupLimitPerScoringPeriod: boolean;
    minimumBid: number;
    transactionLockingEnabled: boolean;
    waiverHours: number;
    waiverOrderReset: boolean;
    waiverProcessDays: string[];
    waiverProcessHour: number;
};

export type DraftSettings = {
    auctionBudget: number;
    availableDate: number;
    date: number;
    isTradingEnabled: boolean;
    keeperCount: number;
    keeperCountFuture: number;
    keeperOrderType: string;
    leagueSubType: string;
    orderType: string;
    pickOrder: number[];
    timePerSelection: number;
    type: string;
};

export type FinanceSettings = {
    entryFee: number;
    miscFee: number;
    perLoss: number;
    perTrade: number;
    playerAcquisition: number;
    playerDrop: number;
    playerMoveToActive: number;
    playerMoveToIR: number;
};

export type RosterSettings = {
    isBenchUnlimited: boolean;
    isUsingUndroppableList: boolean;
    lineupLocktimeType: string;
    lineupSlotCounts: { [key: string]: number };
    lineupSlotStatLimits: { [key: string]: number };
    moveLimit: number;
    positionLimits: { [key: string]: number };
    rosterLocktimeType: string;
    universeIds: number[];
};

export type ScheduleSettings = {
    divisions: { id: number; name: string; size: number }[];
    matchupPeriodCount: number;
    matchupPeriodLength: number;
    matchupPeriods: { [key: string]: number[] };
    periodTypeId: number;
    playoffMatchupPeriodLength: number;
    playoffReseed: boolean;
    playoffSeedingRule: string;
    playoffSeedingRuleBy: number;
    playoffTeamCount: number;
    variablePlayoffMatchupPeriodLength: boolean;
};

export type ScoringType = 'STANDARD' | 'PPR';

export type ScoringSettings = {
    allowOutOfPositionScoring: boolean;
    homeTeamBonus: number;
    matchupTieRule: string;
    matchupTieRuleBy: number;
    playerRankType: string;
    playoffHomeTeamBonus: number;
    playoffMatchupTieRule: string;
    playoffMatchupTieRuleBy: number;
    scoringItems: {
        isReverseItem: boolean;
        leagueRanking: number;
        leagueTotal: number;
        points: number;
        pointsOverrides: { [key: string]: number };
        statId: number;
    }[];
    scoringType: ScoringType;
};

export type TradeSettings = {
    allowOutOfUniverse: boolean;
    deadlineDate: number;
    max: number;
    revisionHours: number;
    vetoVotesRequired: number;
};

export type DraftInfo = {
    draftDetail: DraftInfoDetail;
    gameId: number;
    id: number;
    schedule: any;
    scoringPeriodId: number;
    seasonId: number;
    segmentId: number;
    settings: Settings;
    status: Status;
    teams: any;
}

export type DraftInfoDetail = {
    completeDate: number;
    drafted: boolean;
    inProgress: boolean;
    picks: DraftPick[];
};

export type DraftPick = {
    autoDraftTypeId: number;
    bidAmount: number;
    id: number;
    keeper: boolean;
    lineupSlotId: number;
    memberId: string;
    nominatingTeamId: number;
    overallPickNumber: number;
    playerId: number;
    reservedForKeeper: boolean;
    roundId: number;
    roundPickNumber: number;
    teamId: number;
    tradeLocked: boolean;
};

export type PlayersInfo = {
    players: PlayerInfo[];
    positionAgainstOpponent: any;
};

export type DraftRanksByRankType = {
    STANDARD: RankInfo;
    PPR: RankInfo;
};

export type RankInfo = {
    auctionValue: number;
    averageRank?: number;
    published: boolean;
    rank: number;
    rankSourceId: number;
    rankType: ScoringType;
    slotId: number;
};

export type PlayerInfo = {
    draftAuctionValue: number;
    id: number;
    keeperValue: number;
    keeperValueFuture: number;
    lineupLocked: boolean;
    onTeamId: number;
    player: {
        active: boolean;
        defaultPositionId: number;
        draftRanksByRankType?: DraftRanksByRankType;
        droppable: boolean;
        eligibleSlots: number[];
        firstName: string;
        fullName: string;
        id: number;
        injured: boolean;
        injuryStatus: string;
        jersey: string;
        lastName: string;
        ownership: {
            activityLevel: null;
            auctionValueAverage: number;
            auctionValueAverageChange: number;
            averageDraftPosition: number;
            averageDraftPositionPercentChange: number;
            date: null;
            leagueType: number;
            percentChange: number;
            percentOwned: number;
            percentStarted: number;
        };
        proTeamId: number;
        stats: {
            appliedTotal: number;
            externalId: string;
            id: string;
            proTeamId: number;
            scoringPeriodId: number;
            seasonId: number;
            statSourceId: number;
            statSplitTypeId: number;
            stats: {
                [key: string]: number;
            };
        }[];
    };
    ratings?: {
        [key: string]: {
            positionalRanking: number;
            totalRanking: number;
            totalRating: number;
        };
    };
    rosterLocked: boolean;
    status: string;
    tradeLocked: boolean;
};

export type TeamInfo = {
    teams: Team[];
    members: Member[];
};

export type Team = {
    abbrev: string;
    currentProjectedRank: number;
    divisionId: number;
    draftDayProjectedRank: number;
    id: number;
    isActive: boolean;
    logo: string;
    logoType: string;
    name: string;
    owners: string[];
    playoffSeed: number;
    points: number;
    pointsAdjusted: number;
    pointsDelta: number;
    primaryOwner: string;
    rankCalculatedFinal: number;
    rankFinal: number;
    record: {
        away: TeamRecord;
        division: TeamRecord;
        home: TeamRecord;
        overall: TeamRecord;
    };
    roster: {
        appliedStatTotal: number;
        entries: RosterEntry[]; // You can replace `any` with the appropriate type
        tradeReservedEntries: number;
    };
    transactionCounter: {
        acquisitionBudgetSpent: number;
        acquisitions: number;
        drops: number;
        matchupAcquisitionTotals: Record<string, number>;
        misc: number;
        moveToActive: number;
        moveToIR: number;
        paid: number;
        teamCharges: number;
        trades: number;
    };
    valuesByStat: Record<string, number>;
    waiverRank: number;
}

export type TeamRecord = {
    gamesBack: number;
    losses: number;
    percentage: number;
    pointsAgainst: number;
    pointsFor: number;
    streakLength: number;
    streakType: string;
    ties: number;
    wins: number;
}

export type RosterEntry = {
    acquisitionDate: null | string;
    acquisitionType: null | string;
    injuryStatus: "NORMAL" | "ACTIVE";
    lineupSlotId: number;
    pendingTransactionIds: null | string[];
    playerId: number;
    playerPoolEntry: {
        appliedStatTotal: number;
        id: number;
        keeperValue: number;
        keeperValueFuture: number;
        lineupLocked: boolean;
        onTeamId: number;
        player: {
            active: boolean;
            defaultPositionId: number;
            eligibleSlots: number[];
            firstName: string;
            lastName: string;
            fullName: string;
            id: number;
            draftRanksByRankType: {
                PPR: {
                    auctionValue: number;
                    published: boolean;
                    rank: number;
                    rankSourceId: number;
                    rankType: "PPR";
                    slotId: number;
                };
                STANDARD: {
                    auctionValue: number;
                    published: boolean;
                    rank: number;
                    rankSourceId: number;
                    rankType: "STANDARD";
                    slotId: number;
                };
            };
            rankings?: {
                [key: string]: RankInfo[];
            };
            droppable: boolean;
            injured: boolean;
            injuryStatus: string;
            ownership: {
                auctionValueAverage: number;
                averageDraftPosition: number;
                percentChange: number;
                percentOwned: number;
                percentStarted: number;
            };
            proTeamId: number;
            stats: {
                appliedAverage?: number;
                appliedStats?: Record<string, number>;
                appliedTotal: number;
                externalId: string;
                id: string;
                proTeamId: number;
                scoringPeriodId: number;
                seasonId: number;
                statSourceId: number;
                statSplitTypeId: number;
                stats?: Record<string, number>;
            }[];
        };
        universeId: number;
    };
    ratings: {
        [key: string]: {
            positionalRanking: number;
            totalRanking: number;
            totalRating: number;
        };
    };
    rosterLocked: boolean;
    status: "ONTEAM" | "NORMAL";
    tradeLocked: boolean;
};

export type Member = {
    displayName: string;
    firstName: string;
    id: string;
    lastName: string;
    notificationSettings: NotificationSetting[];
};

export type NotificationSetting = {
    enabled: boolean;
    id: string;
    type: string;
};
