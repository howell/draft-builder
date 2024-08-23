import { SleeperApi, importSleeperLeagueInfo, importSleeperDraftDetail, importSleeperTeamInfo } from "./SleeperApi";
import { SleeperLeague } from "../common";
import { fetchLeagueInfo, fetchLeagueHistory, fetchDraftInfo, fetchLeagueTeams } from "./api";
import { LeagueInfo, LeagueHistory, DraftDetail, LeagueTeam } from "../PlatformApi";
import * as SleeperT from "./types";
import { realDraftInfo, realLeague } from "./examples";

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
            const draftId = '5878';

            (fetchDraftInfo as jest.Mock).mockResolvedValue(400);

            const sleeperApi = new SleeperApi(league);
            const result = await sleeperApi.fetchDraft(draftId);

            expect(fetchDraftInfo).toHaveBeenCalledWith(draftId);
            expect(result).toEqual(400);
        });

        it("should return error code if draftId is not provided", async () => {
            const sleeperApi = new SleeperApi(league);
            const result = await sleeperApi.fetchDraft();

            expect(fetchDraftInfo).not.toHaveBeenCalled();
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

            (fetchLeagueTeams as jest.Mock).mockResolvedValue(leagueTeams);

            const sleeperApi = new SleeperApi(league);
            const result = await sleeperApi.fetchLeagueTeams();

            expect(fetchLeagueTeams).toHaveBeenCalledWith(league.id);
            expect(result).toEqual(expectedLeagueTeams);
        });
    });

    describe("fetchPlayers", () => {
        it("should return an empty array", async () => {
            const sleeperApi = new SleeperApi(league);
            const result = await sleeperApi.fetchPlayers();

            expect(result).toEqual([]);
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
            rosterSettings: {},
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