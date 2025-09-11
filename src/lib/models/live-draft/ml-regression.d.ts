/**
 * Minimal type declarations for ml-regression package
 * 
 * Only includes the MultivariateLinearRegression class that we use
 */

declare module 'ml-regression' {
    export interface MultivariateLinearRegressionOptions {
        intercept?: boolean;
        statistics?: boolean;
    }

    export class MultivariateLinearRegression {
        constructor(
            x: number[][], 
            y: number[][], 
            options?: MultivariateLinearRegressionOptions
        );

        weights: (number | number[])[];
        intercept: number | number[];
        stdError?: number;

        predict(input: number[]): number[];
        predict(inputs: number[][]): number[][];
    }
}