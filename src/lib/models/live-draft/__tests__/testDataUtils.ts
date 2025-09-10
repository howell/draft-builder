/**
 * Test data utilities using real fixtures from ESPN/Sleeper drafts
 * 
 * Uses existing platform transformation functions to convert real API responses
 * to our internal data formats.
 */

import { DraftPick, DraftContext } from '../featureExtraction';
import { TrainingDataPoint } from '../linearRegression';
import { BudgetConverter } from '../budgetConversions';
import { importEspnDraftDetail } from '@/platforms/espn/EspnApi';
import { DraftDetail } from '@/platforms/PlatformApi';
import { RankedPlayer } from '@/types/storage';

// Import real ESPN draft fixture
import * as espnDraft2024Fixture from '../../../../../e2e/fixtures/espn/fetch-draft-espn-2024.json';

// Type for the ESPN API response fixture format
interface EspnDraftFixture {
    status: string;
    data: any; // Raw ESPN API response
}

/**
 * Load real ESPN 2024 draft data using existing transformation functions
 */
export function loadEspn2024DraftData(): DraftDetail {
    const fixture = espnDraft2024Fixture as EspnDraftFixture;
    
    if (fixture.status !== 'ok') {
        throw new Error(`ESPN fixture has error status: ${fixture.status}`);
    }
    
    if (!fixture.data) {
        throw new Error('ESPN fixture missing data');
    }

    // Use the existing ESPN transformation function
    try {
        return importEspnDraftDetail(fixture.data);
    } catch (error) {
        throw new Error(`Failed to transform ESPN draft data: ${error.message}`);
    }
}

/**
 * Convert platform DraftDetail to our live draft DraftPick format
 * Note: This is a simplified version for testing - real implementation would
 * need player database lookup to get positions and rankings
 */
export function convertToLiveDraftPicks(draftDetail: DraftDetail): DraftPick[] {
    return draftDetail.picks.map((pick, index) => ({
        player: {
            // For testing, we'll generate simplified position/ranking data
            // Real implementation would look up actual player data
            defaultPosition: generateTestPosition(pick.playerId, index),
            positionRank: generateTestPositionRank(pick.playerId, index),
            overallRank: index + 1
        },
        price: pick.price,
        pickNumber: pick.overallPickNumber
    }));
}

/**
 * Generate test position data for players (simplified for testing)
 */
function generateTestPosition(playerId: string, index: number): string {
    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
    const playerHash = playerId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return positions[playerHash % positions.length];
}

/**
 * Generate test position rank for players (simplified for testing)
 */
function generateTestPositionRank(playerId: string, index: number): number {
    const playerHash = playerId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return (playerHash % 20) + 1; // Rank 1-20 within position
}

/**
 * Get real draft data for testing - no fallbacks, fail if data unavailable
 */
export function getRealDraftData(): DraftPick[] {
    const draftDetail = loadEspn2024DraftData();
    return convertToLiveDraftPicks(draftDetail);
}

/**
 * Create a realistic draft context from real data
 */
export function createRealDraftContext(
    picks: DraftPick[] = [],
    budgetPerTeam: number = 200,
    teamCount: number = 12
): DraftContext {
    return {
        picks,
        currentPickNumber: picks.length + 1,
        totalPicks: teamCount * 15, // Standard 15-player rosters
        budgetConfig: {
            totalBudgetPerTeam: budgetPerTeam,
            teamCount
        }
    };
}

/**
 * Create training data from real draft picks
 */
export function createTrainingDataFromRealPicks(
    picks: DraftPick[],
    budgetConfig: { totalBudgetPerTeam: number; teamCount: number }
): TrainingDataPoint[] {
    const converter = new BudgetConverter(budgetConfig);
    const trainingData: TrainingDataPoint[] = [];

    // For each pick, create a training sample using the state before that pick
    for (let i = 0; i < picks.length; i++) {
        const pick = picks[i];
        const priorPicks = picks.slice(0, i); // Picks made before this one
        
        const context = createRealDraftContext(priorPicks, budgetConfig.totalBudgetPerTeam, budgetConfig.teamCount);
        
        // Simple feature extraction (you could use actual FeatureExtractor here)
        const features = {
            playerPosition: pick.player.defaultPosition,
            playerPositionRank: pick.player.positionRank,
            playerOverallRank: pick.player.overallRank,
            positionScarcity: calculateSimplePositionScarcity(pick.player, priorPicks),
            overallScarcity: calculateSimpleOverallScarcity(pick.player, priorPicks),
            budgetSpentPct: converter.toLeagueBudgetPercentage(
                priorPicks.reduce((sum, p) => sum + p.price, 0)
            ),
            budgetPressure: 0, // Simplified for now
            positionalPressure: 0 // Simplified for now
        };

        const actualPricePct = converter.toLeagueBudgetPercentage(pick.price);

        trainingData.push({
            features,
            actualPricePct
        });
    }

    return trainingData;
}

/**
 * Simple position scarcity calculation for test data
 */
function calculateSimplePositionScarcity(
    player: { defaultPosition: string; positionRank: number },
    picks: DraftPick[]
): number {
    const higherRankedDrafted = picks.filter(pick => 
        pick.player.defaultPosition === player.defaultPosition && 
        pick.player.positionRank < player.positionRank
    ).length;
    
    return Math.min(1.0, higherRankedDrafted / player.positionRank);
}

/**
 * Simple overall scarcity calculation for test data
 */
function calculateSimpleOverallScarcity(
    player: { overallRank: number },
    picks: DraftPick[]
): number {
    const higherRankedDrafted = picks.filter(pick => 
        pick.player.overallRank < player.overallRank
    ).length;
    
    return Math.min(1.0, higherRankedDrafted / player.overallRank);
}

/**
 * Get sample data for testing using real ESPN data
 */
export function getSampleTestData(): {
    picks: DraftPick[];
    trainingData: TrainingDataPoint[];
    context: DraftContext;
} {
    const picks = getRealDraftData();

    // Limit to reasonable size for tests
    const testPicks = picks.slice(0, 50);
    
    const budgetConfig = { totalBudgetPerTeam: 200, teamCount: 12 };
    const context = createRealDraftContext(testPicks, budgetConfig.totalBudgetPerTeam, budgetConfig.teamCount);
    const trainingData = createTrainingDataFromRealPicks(testPicks, budgetConfig);

    return {
        picks: testPicks,
        trainingData,
        context
    };
}

/**
 * Get minimal test data for basic functionality tests
 */
export function getMinimalTestData(): {
    picks: DraftPick[];
    trainingData: TrainingDataPoint[];
    context: DraftContext;
} {
    // Create minimal realistic data for quick tests
    const picks: DraftPick[] = [
        {
            player: { defaultPosition: 'RB', positionRank: 1, overallRank: 2 },
            price: 65,
            pickNumber: 1
        },
        {
            player: { defaultPosition: 'WR', positionRank: 1, overallRank: 1 },
            price: 70,
            pickNumber: 2
        },
        {
            player: { defaultPosition: 'QB', positionRank: 1, overallRank: 3 },
            price: 45,
            pickNumber: 3
        },
        {
            player: { defaultPosition: 'RB', positionRank: 2, overallRank: 5 },
            price: 55,
            pickNumber: 4
        }
    ];

    const budgetConfig = { totalBudgetPerTeam: 200, teamCount: 12 };
    const context = createRealDraftContext(picks, budgetConfig.totalBudgetPerTeam, budgetConfig.teamCount);
    const trainingData = createTrainingDataFromRealPicks(picks, budgetConfig);

    return {
        picks,
        trainingData,
        context
    };
}

/**
 * Get test data with specific characteristics for edge case testing
 */
export function getEdgeCaseTestData(): {
    highScarcity: DraftPick[];
    lowScarcity: DraftPick[];
    extremePrices: DraftPick[];
} {
    return {
        // High scarcity: many top players already drafted
        highScarcity: Array.from({ length: 20 }, (_, i) => ({
            player: { defaultPosition: 'RB', positionRank: i + 1, overallRank: i + 1 },
            price: 60 - i * 2,
            pickNumber: i + 1
        })),
        
        // Low scarcity: few top players drafted
        lowScarcity: [
            {
                player: { defaultPosition: 'K', positionRank: 1, overallRank: 150 },
                price: 1,
                pickNumber: 1
            },
            {
                player: { defaultPosition: 'DEF', positionRank: 1, overallRank: 160 },
                price: 1,
                pickNumber: 2
            }
        ],
        
        // Extreme prices
        extremePrices: [
            {
                player: { defaultPosition: 'RB', positionRank: 1, overallRank: 1 },
                price: 95, // Very high
                pickNumber: 1
            },
            {
                player: { defaultPosition: 'K', positionRank: 1, overallRank: 200 },
                price: 1, // Very low
                pickNumber: 2
            }
        ]
    };
}