import regression from 'regression'

export function meanSquaredError<T>(data: T[], actual: (d: T) => number, predicted: (d: T) => number): number {
    return data.map(d => Math.pow(actual(d) - predicted(d), 2)).reduce((a, b) => a + b, 0) / data.length;
}

export function findBestRegression(data: [number, number][], stepSize: number = 2, limit?: number): regression.Result {
    limit = limit || data.length;
    let bestRegression: regression.Result = regression.exponential(data);
    let bestTopMSE = meanSquaredError(data.slice(0, 50), d => d[1], d => predictPrice(bestRegression, d[0]));
    let bestError = meanSquaredError(data, d => d[1], d => predictPrice(bestRegression, d[0]));
    console.log("Initial MSE: ", bestError)
    console.log("Initial Top 50 MSE:", bestTopMSE);
    for (let i = 0; i < limit; i += stepSize) {
        const subset = data.slice(0, i);
        const result = regression.exponential(subset);
        const error = meanSquaredError(data, d => d[1], d => predictPrice(result, d[0]));
        const topError = meanSquaredError(data.slice(0, 50), d => d[1], d => predictPrice(result, d[0]));
        if (topError < bestTopMSE) {
            bestTopMSE = topError;
            console.log("New best top 50 MSE: ", topError, "at ", i)
        }
        if (error < bestError) {
            console.log("New best MSE: ", error, "at ", i)
            console.log("New top 50 MSE:", topError);
            bestError = error;
            bestRegression = result;
        }
    }
    console.log("Final MSE: ", bestError)
    return bestRegression
}

export function predictPrice(regression: regression.Result, index: number): number {
    return Math.max(1, Math.round(regression.predict(index)[1]));
}