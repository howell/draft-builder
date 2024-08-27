import { SleeperApi, importSleeperLeagueInfo, importSleeperDraftDetail, importSleeperTeamInfo, importSleeperDraftPick } from "./SleeperApi";
import { SleeperLeague } from "../common";
import { fetchLeagueInfo, fetchLeagueHistory, fetchDraftInfo, fetchLeagueTeams } from "./api";
import { LeagueInfo, LeagueHistory, DraftDetail, LeagueTeam } from "../PlatformApi";
import * as SleeperT from "./types";
import { realDraftInfo, realLeague, realDraftPick, realDraftPick2 } from "./examples";

jest.mock("./api");

describe("SleeperApi", () => {
    const league: SleeperLeague = {
        platform: "sleeper",
        id: '123',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("fetchLeague", () => {
        it("should fetch league info", async () => {
            const leagueInfo: SleeperT.LeagueInfo = {
                name: "Test League",
                status: "complete",
                draft_id: '972738',
                roster_positions: [],
                scoring_settings: { rec: 1 } as any,
            } as any;
            const draftInfo: SleeperT.DraftInfo = {
                type: "auction",
                settings: { budget: 200 } as any,
            } as any;
            const expectedLeagueInfo: LeagueInfo = {
                name: "Test League",
                drafted: true,
                scoringType: "ppr",
                draft: {
                    type: "auction",
                    auctionBudget: 200,
                },
                rosterSettings: {},
            };

            (fetchLeagueInfo as jest.Mock).mockResolvedValue(leagueInfo);
            (fetchDraftInfo as jest.Mock).mockResolvedValue(draftInfo);

            const sleeperApi = new SleeperApi(league);
            const result = await sleeperApi.fetchLeague();

            expect(fetchLeagueInfo).toHaveBeenCalledWith(league.id);
            expect(fetchDraftInfo).toHaveBeenCalledWith(leagueInfo.draft_id);
            expect(result).toEqual(expectedLeagueInfo);
        });

        it("should return error code if league info fetch fails", async () => {
            (fetchLeagueInfo as jest.Mock).mockResolvedValue(400);

            const sleeperApi = new SleeperApi(league);
            const result = await sleeperApi.fetchLeague();

            expect(fetchLeagueInfo).toHaveBeenCalledWith(league.id);
            expect(result).toEqual(400);
        });
    });

    describe("fetchDraft", () => {

        it("should return error code if draft info fetch fails", async () => {
            const sesasonId = '2024';


            (fetchLeagueInfo as jest.Mock).mockResolvedValue({season: '2024', draft_id: '123'} as any);
            (fetchDraftInfo as jest.Mock).mockResolvedValue(400);

            const sleeperApi = new SleeperApi(league);
            const result = await sleeperApi.fetchDraft(sesasonId);

            expect(fetchLeagueInfo).toHaveBeenCalledWith(league.id);
            expect(fetchDraftInfo).toHaveBeenCalledWith('123');
            expect(result).toEqual(400);
        });

    });

    describe("fetchLeagueTeams", () => {
        it("should fetch league teams", async () => {
            const leagueTeams: SleeperT.LeagueUser[] = [
                { user_id: "1", display_name: "Team 1" },
                { user_id: "2", display_name: "Team 2" },
            ] as any[];
            const expectedLeagueTeams: LeagueTeam[] = [
                { id: "1", name: "Team 1" },
                { id: "2", name: "Team 2" },
            ];

            (fetchLeagueInfo as jest.Mock).mockResolvedValue({league_id: league.id, season: '2024', draft_id: '123'} as any);
            (fetchLeagueTeams as jest.Mock).mockResolvedValue(leagueTeams);

            const sleeperApi = new SleeperApi(league);
            const result = await sleeperApi.fetchLeagueTeams('2024');

            expect(fetchLeagueTeams).toHaveBeenCalledWith(league.id);
            expect(result).toEqual(expectedLeagueTeams);
        });
    });
});

describe("importSleeperLeagueInfo", () => {
    it("should import Sleeper league info", () => {
        const expectedLeagueInfo: LeagueInfo = {
            name: "The Ham",
            drafted: false,
            scoringType: "half-ppr",
            draft: {
                type: "auction",
                auctionBudget: 200,
            },
            rosterSettings: {
                QB: 1,
                RB: 2,
                WR: 2,
                TE: 1,
                FLEX: 1,
                REC_FLEX: 1,
                SUPER_FLEX: 1,
                DEF: 1,
                BN: 5
            },
        };

        const result = importSleeperLeagueInfo(realLeague, realDraftInfo);

        expect(result).toEqual(expectedLeagueInfo);
    });
});

describe("importSleeperTeamInfo", () => {
    it("should import Sleeper team info", () => {
        const sleeperTeamInfo: SleeperT.LeagueUser = {
            user_id: "1",
            display_name: "Team 1",
        } as any;
        const expectedTeamInfo: LeagueTeam = {
            id: "1",
            name: "Team 1",
        };

        const result = importSleeperTeamInfo(sleeperTeamInfo);

        expect(result).toEqual(expectedTeamInfo);
    });
});

describe("importSleeperDraftPick", () => {
    it("should import Sleeper draft pick", () => {
        const lookupRoster = jest.fn().mockReturnValue("777");
        expect(importSleeperDraftPick(realDraftPick, lookupRoster)).toEqual(
            {
                playerId: "KC",
                team: "739615909098000384",
                price: 1,
                overallPickNumber: 180,
            }
        );

        expect(importSleeperDraftPick(realDraftPick2, lookupRoster)).toEqual(
            {
                playerId: "7569",
                team: "73448567356145664",
                price: 1,
                overallPickNumber: 144,
            }
        );
    });

    it ("should handle empty picked_by", () => {
        const lookupRoster = jest.fn().mockReturnValue("777");
        const pick = {...realDraftPick, picked_by: ''};
        expect(importSleeperDraftPick(pick, lookupRoster)).toEqual(
            {
                playerId: "KC",
                team: "777",
                price: 1,
                overallPickNumber: 180,
            }
        );
    });
});