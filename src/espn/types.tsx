type LeagueInfo = {
    draftDetail: DraftDetail;
    gameId: number;
    id: number;
    scoringPeriodId: number;
    seasonId: number;
    segmentId: number;
    settings: Settings;
    status: Status;
};

type Settings = {
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

type Status = {
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

type DraftDetail = {
    drafted: boolean;
    inProgress: boolean;
};

type AcquisitionSettings = {
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

type DraftSettings = {
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

type FinanceSettings = {
    entryFee: number;
    miscFee: number;
    perLoss: number;
    perTrade: number;
    playerAcquisition: number;
    playerDrop: number;
    playerMoveToActive: number;
    playerMoveToIR: number;
};

type RosterSettings = {
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

type ScheduleSettings = {
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

type ScoringSettings = {
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
    scoringType: string;
};

type TradeSettings = {
    allowOutOfUniverse: boolean;
    deadlineDate: number;
    max: number;
    revisionHours: number;
    vetoVotesRequired: number;
};
