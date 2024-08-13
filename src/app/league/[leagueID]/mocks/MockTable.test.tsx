import { MockPlayer, SearchSettingsState } from '@/app/savedMockTypes';
import { playerAvailable } from './MockTable';

describe('playerAvailable', () => {
    const mockPlayer: MockPlayer = {
        id: 1,
        name: "Sam Brady",
        positions: ["QB", "TE"],
        defaultPosition: "QB",
        suggestedCost: 120,
        overallRank: 1,
        positionRank: 1
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
            mockCostPredictor,
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
            mockCostPredictor,
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
            mockPlayer,
            mockSearchSettings,
            expensivePredictor,
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
            mockCostPredictor,
            mockSelectedPlayers,
            mockAuctionBudget,
            mockBudgetSpent
        );

        expect(result).toBe(false);
    });

    it('should return false when player cost is below minPrice', () => {
        const result = playerAvailable(
            mockPlayer,
            mockSearchSettings,
            cheapPredictor,
            mockSelectedPlayers,
            mockAuctionBudget,
            mockBudgetSpent
        );

        expect(result).toBe(false);
    });

    it('should return false when player cost is above maxPrice', () => {
        const result = playerAvailable(
            mockPlayer,
            mockSearchSettings,
            expensivePredictor,
            mockSelectedPlayers,
            mockAuctionBudget,
            mockBudgetSpent
        );

        expect(result).toBe(false);
    });
});