# Analytics and Calculations Engine

## Overview
Draft Builder's analytics engine is the core computational system that transforms raw draft data into actionable insights for fantasy football draft preparation. The engine combines statistical modeling, regression analysis, and real-time calculations to provide accurate player valuations and budget guidance.

## Mathematical Foundations

### Exponential Regression Model
The analytics engine uses exponential regression as its primary valuation method:

```typescript
// Core regression implementation in src/app/league/analytics.ts
function findBestRegression(data: [number, number][], stepSize: number = 2, limit?: number): regression.Result
```

**Mathematical Model**: `y = a * e^(b * x)`
- **y**: Predicted auction price
- **x**: Player rank (overall or positional)
- **a**: Base coefficient (theoretical price for rank 0)
- **b**: Decay rate (typically negative, indicating price decrease with rank)

#### Why Exponential Regression?
Fantasy auction prices follow exponential decay patterns:
- **Elite Players**: Command disproportionately high prices
- **Replacement Level**: Steep drop-off after tier breaks
- **Deep Bench**: Minimal price variation at low ranks

### Regression Optimization Algorithm
```typescript
function findBestRegression(data: [number, number][], stepSize: number = 2, limit?: number): regression.Result {
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
    return bestRegression;
}
```

**Optimization Strategy**:
1. **Subset Testing**: Tests regression fits on data subsets of increasing size
2. **Dual Error Metrics**: Optimizes both overall accuracy and top-50 player accuracy
3. **Step-wise Search**: Uses configurable step size for performance/accuracy balance
4. **Best Fit Selection**: Returns regression with lowest overall mean squared error

## Player Valuation Methods

### Multi-Factor Price Prediction
```typescript
function predictCostWithSettings(player: RankedPlayer, settings: EstimationSettingsState, draftHistory: Map<SeasonId, DraftAnalysis>): number
```

#### Historical Data Integration
**Multi-Season Analysis**:
1. **Season Selection**: Users choose which historical years to include
2. **Individual Predictions**: Calculate price estimate for each selected year
3. **Average Calculation**: Simple average of all yearly predictions
4. **Floor Protection**: Ensure minimum $1 cost for all players

#### Weighted Prediction Formula
```typescript
function weightedPrediction(player: RankedPlayer, analysis: DraftAnalysis, weight: number): number {
    const [overallPrediction, positionPrediction] = costPredictions(player, analysis);
    const positionWeight = weight / 100;
    const overallWeight = 1 - positionWeight;
    return overallWeight * overallPrediction + positionWeight * positionPrediction;
}
```

**Weight Balance**:
- **Overall Rank Weight** (0-100%): Price based on player's overall ranking (e.g., 15th overall)
- **Position Rank Weight** (0-100%): Price based on positional ranking (e.g., RB6)
- **User Control**: Slider interface allows real-time weight adjustment

#### Dual Prediction System
```typescript
function costPredictions(player: RankedPlayer, analysis: DraftAnalysis): [number, number] {
    const positionName = player.defaultPosition;
    const overallPrediction = predictExponential(player.overallRank, analysis.overall);
    const coeffs = analysis.positions.get(positionName) as ExponentialCoefficients;
    
    if (!coeffs) {
        // Fallback for missing position data
        return [overallPrediction, overallPrediction];
    }
    
    const positionPrediction = predictExponential(player.positionRank, coeffs);
    return [overallPrediction, positionPrediction];
}
```

### Draft Pick Value Calculations

#### Historical Draft Analysis
```typescript
function analyzeDraft(draftedPlayers: DraftedPlayer[]): DraftAnalysis
```

**Analysis Process**:
1. **Price Sorting**: Sort all picks by descending auction price
2. **Overall Regression**: Fit exponential curve to all picks regardless of position
3. **Position-Specific Regression**: Separate curves for QB, RB, WR, TE, etc.
4. **Coefficient Storage**: Save curve parameters for future predictions

#### Price Point Generation
```typescript
const data = sortedPicks.map((pick, index) => [index, pick.price] as [number, number]);
const overall = findBestRegression(data).equation as [number, number];
```

**Data Transformation**:
- **Index-Based Ranking**: Uses sequential index (0, 1, 2...) as x-axis
- **Price Mapping**: Maps actual auction prices to y-axis
- **Regression Fitting**: Finds best exponential fit for price decay

## Position Scarcity Algorithms

### Position-Specific Value Analysis
Each fantasy position exhibits unique pricing patterns:

#### Quarterback (QB) Analysis
- **Shallow Position**: Typically 12-14 starting QBs in 12-team leagues
- **Late-Round Value**: Quality QBs available in later rounds
- **Streaming Strategy**: Viable to rotate QBs based on matchups
- **Price Curve**: Relatively flat exponential decay

#### Running Back (RB) Analysis
- **Scarcity Premium**: Limited number of bell-cow RBs
- **Injury Risk**: Higher injury rates affect long-term value
- **Handcuff Value**: Backup RBs have significant contingent value
- **Price Curve**: Steep decay from elite to replacement level

#### Wide Receiver (WR) Analysis
- **Deep Position**: More startable WRs than other positions
- **Target Share**: Volume-based valuation critical
- **Consistency Factors**: Reception-based scoring reduces volatility
- **Price Curve**: Moderate decay with several value tiers

#### Tight End (TE) Analysis
- **Bipolar Position**: Elite TEs vs replacement level massive gap
- **Limited Elite Options**: Usually 3-5 truly elite TEs
- **Positional Advantage**: Elite TEs provide significant scoring edge
- **Price Curve**: Very steep initial decay, then flat replacement level

### Replacement Level Calculations
```typescript
// Position-specific analysis within analyzeDraft
for (const pick of sortedPicks) {
    const position = pick.position;
    if (!positions.has(position)) {
        const positionData = sortedPicks
            .filter(p => p.position === position)
            .map((p, index) => [index, p.price] as [number, number]);
        const positionRegression = findBestRegression(positionData);
        positions.set(position, positionRegression.equation as [number, number]);
    }
}
```

**Replacement Level Methodology**:
1. **Position Isolation**: Filter draft picks by position
2. **Rank-within-Position**: Create position-specific ranking (RB1, RB2, etc.)
3. **Position Curves**: Generate exponential regression for each position
4. **Value Identification**: Find optimal spending points and tier breaks

## Budget Optimization Logic

### Real-time Budget Tracking
```typescript
function calculateAmountSpent(costEstimator: CostPredictor, rosterSpots: number, selectedPlayers: RankedPlayer[], adjustments: Map<string, number>): number {
    const unSelectedCost = rosterSpots - selectedPlayers.length;
    const selectionsCost = sum(selectedPlayers.map(costEstimator.predict));
    const costAdjustments = sum(Array.from(adjustments.values()));
    return unSelectedCost + selectionsCost + costAdjustments;
}
```

**Budget Components**:
- **Selected Players**: Sum of estimated costs for already-selected players
- **Unselected Slots**: Minimum $1 for each remaining roster position
- **Manual Adjustments**: User-defined price modifications
- **Total Constraint**: Must not exceed league auction budget

### Dynamic Player Filtering
```typescript
function playerAvailable(player: CostEstimatedPlayer, settings: SearchSettingsState, selectedPlayers: RankedPlayer[], auctionBudget: number, budgetSpent: number): boolean
```

**Availability Criteria**:
1. **Position Filter**: Player matches selected position filters
2. **Price Range**: Player cost within min/max price settings
3. **Budget Constraint**: Player affordable with remaining budget
4. **Uniqueness**: Player not already selected
5. **Roster Requirement**: Player fills a needed roster position

### Position-Based Budget Allocation
```typescript
// Position-specific player pools
for (const position of playerPositions) {
    const settingsWithPosition = { ...searchSettings, positions: [position] };
    nextPositionallyAvailablePlayers.set(position, displayRankedPlayers.filter(includePlayer(settingsWithPosition)));
}
```

**Allocation Strategy**:
- **Position Separation**: Separate budget tracking for each roster position
- **Flex Consideration**: Players eligible for multiple positions counted in each pool
- **Budget Distribution**: Algorithm suggests optimal budget allocation across positions

## Performance Metrics

### Prediction Accuracy Measurement
```typescript
function meanSquaredError<T>(data: T[], actual: (d: T) => number, predicted: (d: T) => number): number {
    return data.map(d => Math.pow(actual(d) - predicted(d), 2)).reduce((a, b) => a + b, 0) / data.length;
}
```

**Accuracy Metrics**:
- **Mean Squared Error (MSE)**: Average of squared prediction errors
- **Top-50 MSE**: MSE for first 50 picks (most important predictions)
- **Position-Specific MSE**: Accuracy tracking by position
- **Percentage Error**: Relative error as percentage of actual price

### Real-time Performance Monitoring
The system tracks several performance indicators:

#### Calculation Performance
- **Regression Speed**: Time to fit exponential curves
- **Filter Performance**: Player search and filter response time
- **Budget Updates**: Real-time budget recalculation speed
- **Memory Usage**: Efficient handling of large player datasets

#### Prediction Quality
- **Historical Validation**: Compare predictions to actual results
- **Cross-Validation**: Test accuracy on held-out draft data
- **User Feedback**: Track user satisfaction with price predictions
- **Market Comparison**: Compare to external fantasy value sources

## Advanced Analytics Features

### Tier Analysis (Planned)
Future enhancement to identify value tiers:
- **Statistical Clustering**: Group players with similar values
- **Tier Boundaries**: Identify significant value drop-offs
- **Position Tiers**: Separate tier analysis for each position
- **Visual Indicators**: Color-coding and visual tier representation

### Value Curve Visualization
Current implementation in `PlayerScatterChart.tsx`:
```typescript
function initializeData(data: TableData[]): ChartData {
    const regressionData = chartData.map(v => [v.index, v.auctionPrice] as [number, number]);
    const result = findBestRegression(regressionData);
    const withPredictions = chartData.map((v, i) => {
        const prediction = predictPrice(result, i);
        const delta = prediction - v.auctionPrice;
        return { ...v, prediction, tooltip: `${i + 1}: ${v.name} (${v.position}), \$${v.auctionPrice}`, desc: `predicted: ${prediction} (err=${delta})` }
    });
}
```

### Breakpoint Identification
Algorithm to identify optimal spending points:
- **Value Inflection Points**: Where price drops accelerate
- **Position Switches**: Optimal points to change position focus
- **Budget Allocation**: Optimal spending distribution across positions
- **Risk Assessment**: Variance analysis for prediction confidence

## Data Processing Pipeline

### Input Data Sources
1. **Platform Data**: ESPN/Sleeper auction values and player data
2. **Historical Drafts**: Past auction results from user's league
3. **External Rankings**: Google Sheets ADP and ranking data
4. **User Preferences**: Manual adjustments and configuration

### Processing Steps
1. **Data Normalization**: Convert platform-specific data to common format
2. **Ranking Integration**: Merge multiple ranking sources
3. **Historical Analysis**: Process past drafts for trend analysis
4. **Prediction Generation**: Calculate price estimates using regression models
5. **Real-time Updates**: Continuous recalculation as user interacts

### Output Generation
1. **Price Estimates**: Per-player auction value predictions
2. **Budget Guidance**: Optimal spending recommendations
3. **Value Indicators**: Visual cues for player value relative to cost
4. **Position Analysis**: Position-specific insights and recommendations

## Error Handling and Edge Cases

### Data Quality Issues
- **Missing Rankings**: Handle players without ranking data
- **Incomplete Drafts**: Process partial historical draft data
- **Position Changes**: Handle players changing positions between seasons
- **Platform Differences**: Reconcile different position eligibility rules

### Mathematical Edge Cases
- **Small Sample Size**: Handle leagues with limited historical data
- **Extreme Values**: Handle outlier picks that skew regression analysis
- **Zero Prices**: Handle $0 picks in auction drafts
- **Negative Coefficients**: Ensure exponential model produces positive predictions

### Performance Optimization
- **Calculation Caching**: Cache expensive regression calculations
- **Incremental Updates**: Only recalculate changed portions
- **Lazy Evaluation**: Calculate predictions only when needed
- **Memory Management**: Efficient data structures for large player sets

## Testing and Validation

### Unit Tests
```typescript
// MockTable.test.tsx examples
describe('calculateAmountSpent', () => {
    it('should calculate the correct amount spent when there are selected players and adjustments', () => {
        // Test budget calculation with various scenarios
    });
});
```

### Accuracy Validation
- **Historical Backtesting**: Test predictions against known results
- **Cross-Validation**: Hold out portions of data for testing
- **A/B Testing**: Compare different prediction algorithms
- **User Feedback**: Track prediction satisfaction and outcomes

### Performance Testing
- **Load Testing**: Verify performance with large datasets
- **Stress Testing**: Handle extreme user interactions
- **Memory Testing**: Ensure efficient memory usage patterns
- **Response Time**: Maintain sub-100ms response for interactions

## Future Enhancements

### Advanced Modeling
1. **Machine Learning**: Explore ML models for improved predictions
2. **Multi-Factor Analysis**: Include injury data, strength of schedule, etc.
3. **Dynamic Adjustments**: Real-time market data integration
4. **Collaborative Filtering**: Learn from similar league patterns

### Analytics Expansion
1. **Trade Analysis**: Value evaluation for player trades
2. **Waiver Wire**: Free agent value assessment
3. **Season-Long**: In-season roster optimization
4. **Dynasty Leagues**: Long-term player value modeling

### User Experience
1. **Confidence Intervals**: Show prediction uncertainty ranges
2. **Sensitivity Analysis**: Show how rankings affect valuations
3. **What-If Scenarios**: Budget allocation experimentation
4. **Automated Recommendations**: AI-powered draft suggestions 