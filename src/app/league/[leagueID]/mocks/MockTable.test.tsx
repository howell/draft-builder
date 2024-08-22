import { CostEstimatedPlayer, MockPlayer, SearchSettingsState } from '@/app/savedMockTypes';
import { playerAvailable, calculateAmountSpent, computeRosterSlots   } from './MockTable';

describe('playerAvailable', () => {
    const mockPlayer: CostEstimatedPlayer = {
        id: 1,
        name: "Sam Brady",
        positions: ["QB", "TE"],
        defaultPosition: "QB",
        suggestedCost: 120,
        overallRank: 1,
        positionRank: 1,
        estimatedCost: 10
      };

    const mockSearchSettings: SearchSettingsState = {
        showOnlyAvailable: true,
        positions: ['QB'],
        minPrice: 5,
        maxPrice: 15,
        playerCount: 5,
    };

    const mockCostPredictor = {
        predict: jest.fn(() => 10),
    };

    const mockSelectedPlayers = [
        { id: 2, defaultPosition: 'RB', suggestedCost: 20 },
        { id: 3, defaultPosition: 'WR', suggestedCost: 15 },
    ] as MockPlayer[];

    const mockAuctionBudget = 100;
    const mockBudgetSpent = 50;

    it('should return true when player is available', () => {
        const result = playerAvailable(
            mockPlayer,
            mockSearchSettings,
            mockSelectedPlayers,
            mockAuctionBudget,
            mockBudgetSpent
        );

        expect(result).toBe(true);
    });

    it('should return false when player is already selected', () => {
        const result = playerAvailable(
            { ...mockPlayer, id: 2 },
            mockSearchSettings,
            mockSelectedPlayers,
            mockAuctionBudget,
            mockBudgetSpent
        );

        expect(result).toBe(false);
    });

    const expensivePredictor = {
        predict: jest.fn(() => 100),
    };
    const cheapPredictor = {
        predict: jest.fn(() => 1),
    };

    it('should return false when player cost exceeds budget', () => {
        const result = playerAvailable(
            {...mockPlayer, estimatedCost: 100},
            mockSearchSettings,
            mockSelectedPlayers,
            mockAuctionBudget,
            mockBudgetSpent
        );

        expect(result).toBe(false);
    });

    it('should return false when player position is not included in search settings', () => {
        const result = playerAvailable(
            { ...mockPlayer, defaultPosition: 'TE' },
            mockSearchSettings,
            mockSelectedPlayers,
            mockAuctionBudget,
            mockBudgetSpent
        );

        expect(result).toBe(false);
    });

    it('should return false when player cost is below minPrice', () => {
        const result = playerAvailable(
            {...mockPlayer, estimatedCost: 1},
            mockSearchSettings,
            mockSelectedPlayers,
            mockAuctionBudget,
            mockBudgetSpent
        );

        expect(result).toBe(false);
    });

    it('should return false when player cost is above maxPrice', () => {
        const result = playerAvailable(
            {...mockPlayer, estimatedCost: 20},
            mockSearchSettings,
            mockSelectedPlayers,
            mockAuctionBudget,
            mockBudgetSpent
        );

        expect(result).toBe(false);
    });
});

describe('computeRosterSlots', () => {
    it('should return an array of roster slots based on positions', () => {
        const positions = Object.fromEntries([
            ['QB', 1],
            ['RB', 2],
            ['WR', 3],
        ]);

        const expectedRosterSlots = [
            { position: 'QB', index: 0 },
            { position: 'RB', index: 0 },
            { position: 'RB', index: 1 },
            { position: 'WR', index: 0 },
            { position: 'WR', index: 1 },
            { position: 'WR', index: 2 },
        ];

        const rosterSlots = computeRosterSlots(positions);

        expect(rosterSlots).toEqual(expectedRosterSlots);
    });

    it('should return an empty array when positions map is empty', () => {
        const positions = new Map<string, number>();

        const rosterSlots = computeRosterSlots(positions);

        expect(rosterSlots).toEqual([]);
    });
});

describe('calculateAmountSpent', () => {
    const mockCostEstimator = jest.fn((player: MockPlayer) => player.suggestedCost);

    it('should calculate the correct amount spent when there are no selected players and no adjustments', () => {
        const rosterSpots = 10;
        const selectedPlayers: MockPlayer[] = [];
        const adjustments = new Map<string, number>();

        const result = calculateAmountSpent(mockCostEstimator, rosterSpots, selectedPlayers, adjustments);

        expect(result).toBe(rosterSpots);
    });

    it('should calculate the correct amount spent when there are selected players and no adjustments', () => {
        const rosterSpots = 10;
        const selectedPlayers = [
            { id: 1, suggestedCost: 20 },
            { id: 2, suggestedCost: 30 },
            { id: 3, suggestedCost: 40 },
        ] as MockPlayer[];
        const adjustments = new Map<string, number>();

        const result = calculateAmountSpent(mockCostEstimator, rosterSpots, selectedPlayers, adjustments);

        const expectedCost = selectedPlayers.reduce((total, player) => total + mockCostEstimator(player), 0);
        const unusedCost = rosterSpots - selectedPlayers.length;
        expect(result).toBe(expectedCost + unusedCost);
    });

    it('should calculate the correct amount spent when there are adjustments', () => {
        const rosterSpots = 10;
        const selectedPlayers: MockPlayer[] = [];
        const adjustments = new Map<string, number>([
            ['QB', 5],
            ['RB', 10],
            ['WR', -5],
        ]);

        const result = calculateAmountSpent(mockCostEstimator, rosterSpots, selectedPlayers, adjustments);

        const expectedCost = rosterSpots + adjustments.get('QB')! + adjustments.get('RB')! + adjustments.get('WR')!;
        expect(result).toBe(expectedCost);
    });

    it('should calculate the correct amount spent when there are selected players and adjustments', () => {
        const rosterSpots = 10;
        const selectedPlayers = [
            { id: 1, suggestedCost: 20 },
            { id: 2, suggestedCost: 30 },
            { id: 3, suggestedCost: 40 },
        ] as MockPlayer[];
        const adjustments = new Map<string, number>([
            ['QB', 5],
            ['RB', 10],
            ['WR', -5],
        ]);

        const result = calculateAmountSpent(mockCostEstimator, rosterSpots, selectedPlayers, adjustments);

        const selectedPlayersCost = selectedPlayers.reduce((total, player) => total + player.suggestedCost, 0);
        const adjustmentsCost = adjustments.get('QB')! + adjustments.get('RB')! + adjustments.get('WR')!;
        const unusedCost = rosterSpots - selectedPlayers.length;
        const expectedCost = unusedCost + selectedPlayersCost + adjustmentsCost;
        expect(result).toBe(expectedCost);
    });
});