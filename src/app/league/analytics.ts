import regression from 'regression'

export function meanSquaredError<T>(data: T[], actual: (d: T) => number, predicted: (d: T) => number): number {
    return data.map(d => Math.pow(actual(d) - predicted(d), 2)).reduce((a, b) => a + b, 0) / data.length;
}

export function findBestRegression(data: [number, number][], stepSize: number = 2, limit?: number): regression.Result {
    limit = limit || data.length;
    let bestRegression: regression.Result = regression.exponential(data);
    let bestTopMSE = meanSquaredError(data.slice(0, 50), d => d[1], d => predictPrice(bestRegression, d[0]));
    let bestError = meanSquaredError(data, d => d[1], d => predictPrice(bestRegression, d[0]));
    for (let i = 0; i < limit; i += stepSize) {
        const subset = data.slice(0, i);
        const result = regression.exponential(subset);
        const error = meanSquaredError(data, d => d[1], d => predictPrice(result, d[0]));
        const topError = meanSquaredError(data.slice(0, 50), d => d[1], d => predictPrice(result, d[0]));
        if (topError < bestTopMSE) {
            bestTopMSE = topError;
        }
        if (error < bestError) {
            bestError = error;
            bestRegression = result;
        }
    }
    return bestRegression
}

export function predictPrice(regression: regression.Result, index: number): number {
    return Math.max(1, Math.round(regression.predict(index)[1]));
}

// Shared interface for draft picks used in baseline model creation
export interface BaselineDraftPick {
    price: number;
    position: string;
}

// Baseline models structure used across the application
export interface BaselineModels {
    overall: regression.Result;
    positions: Record<string, regression.Result>;
}

/**
 * Creates baseline price prediction models from historical draft data.
 * This shared function consolidates the logic used by MockDraft, PlayerScatterChart, and LiveDraft.
 * 
 * @param picks Array of draft picks with price and position information
 * @param minPositionPicks Minimum picks required for position-specific models (default: 10)
 * @returns BaselineModels with overall and position-specific regression models
 */
export function createBaselineModels(picks: BaselineDraftPick[], minPositionPicks: number = 10): BaselineModels {
    if (!picks || picks.length === 0) {
        throw new Error('No picks provided for baseline model creation');
    }

    // Sort picks by price descending (same approach used across the app)
    const sortedPicks = picks.sort((a, b) => b.price - a.price);
    
    // Create overall regression data: (index, price) pairs
    const overallData: [number, number][] = sortedPicks.map((pick, index) => [index, pick.price]);
    const overallModel = findBestRegression(overallData);

    // Create position-specific models
    const positionModels: Record<string, regression.Result> = {};
    
    // Group picks by position
    const positionGroups = sortedPicks.reduce((groups, pick) => {
        if (!groups[pick.position]) {
            groups[pick.position] = [];
        }
        groups[pick.position].push(pick);
        return groups;
    }, {} as Record<string, BaselineDraftPick[]>);

    // Create regression model for each position with sufficient data
    for (const [position, positionPicks] of Object.entries(positionGroups)) {
        if (positionPicks.length >= minPositionPicks) {
            // Sort position picks and create (index, price) pairs
            const sortedPositionPicks = positionPicks.sort((a, b) => b.price - a.price);
            const positionData: [number, number][] = sortedPositionPicks.map((pick, index) => [index, pick.price]);
            
            try {
                positionModels[position] = findBestRegression(positionData);
            } catch (error) {
                console.warn(`Failed to create regression model for position ${position}:`, error);
                // Use overall model as fallback for this position
                positionModels[position] = overallModel;
            }
        } else {
            // Use overall model for positions with insufficient data
            positionModels[position] = overallModel;
        }
    }

    return {
        overall: overallModel,
        positions: positionModels
    };
}