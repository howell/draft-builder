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