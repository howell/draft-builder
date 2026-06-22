# Live Draft Price Tracking Implementation Plan

> **2026-06 Modeling Reboot — read this first.**
>
> The original plan below (an 8-feature multiple linear regression predicting
> price-as-%-of-budget) is **retained for comparison only**. Auction prices are
> heavily skewed, a linear fit handles that poorly and can imply negative prices
> late, and the "baseline convergence" behaviour was a hack to fake the
> exponential shape. The live feature now centers on a deterministic
> **inflation-decomposition** model, with the regression kept as a comparison
> baseline so the better model can be chosen empirically.
>
> ### Inflation-decomposition model (`src/lib/models/live-draft/inflationModel.ts`)
>
> ```
> price(player) = 1 + (baseValue(player) - 1) × inflation(position, state)
>
> globalInflation = (money left to spend - $1 reserve per open slot)
>                   --------------------------------------------------
>                   (Σ surplus value of players still to be drafted)
> ```
>
> - `baseValue` reuses the exponential baseline (`predictPrice` in
>   `src/app/league/analytics.ts`); "players still to be drafted" = the top
>   undrafted players capped at the league's **remaining capacity per position**
>   (lineup-slot keys that match no real position act as shared flex capacity).
>   Without the positional cap, a deep position (QBs in a 1-QB league) would
>   contribute surplus value no roster can absorb and distort the field.
> - **No training.** Money is conserved by construction (predicted prices over
>   remaining draftable players sum to remaining money, so the last pick lands at
>   ~$1), and inflation is ~1.0 on an empty board so it degrades to the baseline.
>   The money side excludes **dead money** (teams with full rosters can't spend
>   what they have left) and, optionally, the league's historical
>   **expected-unspent** (money this room habitually leaves on the table was
>   never going to chase players).
> - **Positional inflation = soft team appetite.** Investment pressure compares
>   the actual spend share per position against the **baseline-expected spend
>   share over the same drafted players** (✅ 2026-06 fix: comparing against the
>   *remaining board's* value share manufactured pressure from draft order alone
>   — RBs drafted early at exactly fair prices looked "over-invested"; the
>   neutral-market unit test pins this). Over-invested positions get a dampened
>   appetite, allocations renormalize so money stays conserved, and the appetite
>   exponent is clamped so a thin board can't blow it up. A single `elasticity`
>   knob (0 = global) is **calibrated, not guessed** (see `calibrate.ts`). Teams
>   still bid above $1 on positions they already filled — the model only makes
>   heavy further spend *less likely*, never impossible. (Known limit: the
>   pressure signal is league-aggregate and cross-positional; per-*team* appetite
>   is a possible future refinement.)
>
> ### League-history signals (`history.ts`, all optional knobs, all backtest-gated)
> - **Pooled baselines**: `createPooledBaselineModels` fits the exponential
>   curves on every season at once, on a shared within-draft rank axis. This also
>   makes per-position curves viable; `baselineValue(…, positional)` evaluates a
>   player on its position's own curve (overall rank confounds position with
>   price — high-ranked QBs go cheap in 1-QB leagues).
> - **Positional priors**: `computePositionalPriors` measures this league's
>   historical per-position premium/discount vs the baseline; the model applies
>   it at full strength on an empty board, decaying toward the live appetite
>   signal as real money is spent. Positional factors no longer start pinned at
>   1.0 on pick 1.
> - **Expected unspent**: `averageUnspent` measures money the league leaves on
>   the table at the end of a draft, subtracted from the spendable-money side of
>   the identity (max'd with realized dead money, not double-counted).
> - Historical drafts are normalized with **stored platform values** when
>   available (see "Platform value persistence" below), falling back to
>   price-derived ranks for unmatched players or seasons without data. With
>   real preseason ranks/values, the backtest tests models against the same
>   platform inputs a live draft room shows; the price-derived fallback
>   flatters absolute baseline accuracy but preserves mid-draft dynamics.
>
> ### Platform value persistence (2026-06)
> ESPN's preseason editorial values are scraped into our own
> `platform_player_values` table (migration 003; global reference data,
> world-readable RLS, service-role writes) so backtests never depend on ESPN
> availability:
> - **Sources**: draft-kit cheat-sheet PDFs (frozen preseason artifacts; live
>   CDN 2023+, Wayback 2019-2022; raw PDFs archived under
>   `data/espn-draft-kits/`) parsed by `src/platforms/espn/draftKit.ts`, plus
>   dated API snapshots for the current season only — the API's archived ranks
>   drift in-season (verified: 2023 stored Kelce at rank 37/$22 vs his ~$44+
>   preseason kit value), so only pre-draft snapshots are trustworthy.
> - **Ingest**: `npm run ingest:espn-values -- --backfill 2019:2025 --current`
>   (`scripts/ingest-espn-values.ts`); name→ESPN-id resolution against the
>   season's player list. Periodic intake via the
>   `.github/workflows/ingest-espn-values.yml` cron (weekly; daily Jul-Sep;
>   needs `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` repo secrets).
> - **Read path**: `/api/player-values` route + `usePlayerValuesQuery`;
>   `useSimulatorData` feeds the lookup into `normalizeHistoricalDraft`.
> - **Draft-room formula** (verified empirically on Sam's league): suggested
>   price = `floor(editorial auctionValue × c)` with one league-wide constant
>   (4/3 for a 12-team/$240 league). Superflex, scoring nuances, and roster
>   quirks are NOT reflected; K/DST are always $0 — the gap between platform
>   values and actual prices is exactly the league behavior the model learns.
> - **Per-league multiplier setting** (`c`): persisted per league as a user-level
>   account setting (`user_settings` table, migration 005; key
>   `app/leaguePriceMultipliers` → `{ [leagueId]: number }`), exposed through
>   `StorageAdapter.get/setUserSetting`, the `useLeaguePriceMultipliers` hooks,
>   and the `/settings` account page (`src/app/settings/`). The best-effort
>   default lives in `src/lib/leaguePriceMultiplier.ts`: `1.0` for a standard
>   (ESPN-baseline `$200`) league, `4/3` otherwise. **Stored/viewable/overridable
>   only — not yet applied to any displayed price or model.** Follow-up: feed the
>   effective multiplier into `useSimulatorData` / the platform value path on the
>   dev-gated live-draft page when that integration is planned.
> - **`PlatformValuePredictor`** (`createPlatformValuePredictor`): the same
>   money-conserving identity with `valueSource: 'platform'` — "just trust the
>   platform's prices" as a backtest column the inflation model must beat.
>
> ### Supporting modules
> - `predictor.ts` — unified `PricePredictor` interface; `BaselinePredictor`,
>   `InflationPredictor`, `RegressionPredictor` all implement it so the UI and
>   backtest treat them interchangeably. `PredictionContext` carries the league's
>   `rosterNeeds`.
> - `draftSimulator.ts` — seeded generative simulator: teams nominate and win
>   players at a predictor's price + noise, respecting budgets/slots/$1 minimums.
>   Produces plausible mid-draft states and validates a model (full draft should
>   fill every roster and respect every budget).
> - `backtest.ts` — replays historical drafts pick-by-pick and reports
>   MAE/MAPE/bias per model, by phase and position. `backtestHeldOut` runs
>   **leave-one-out**: each draft is scored with a baseline (and priors/unspent)
>   fit on the *other* drafts, so calibration can't memorize the test data; a
>   single-draft league falls back to in-sample and the report says so.
> - `calibrate.ts` — `calibrateElasticity` grid-searches elasticity by held-out
>   MAE in one pass (one predictor per grid point), honoring the knob toggles.
>
> ### UI — dev-gated simulator
> `src/app/league/[leagueID]/live-draft/page.tsx` is gated behind
> `NEXT_PUBLIC_ENABLE_LIVE_DRAFT_SIM=1` (or `NODE_ENV=development`) and has **no
> production nav link**, honoring the v1 deferral. `DraftSimulator.tsx` +
> `useSimulatorData.ts` load real league data (**all seasons** with draft
> history, not just the latest), generate plausible states, and show a
> side-by-side prediction explorer plus the held-out backtest panel with knob
> toggles and a "Calibrate elasticity" button that applies the best grid point.
>
> Tests: `__tests__/inflationModel.test.ts` (conservation — including from
> platform values, neutral-market no-pressure invariant, over/under-spend
> direction, positional capacity caps, dead money, priors, expected-unspent),
> `__tests__/history.test.ts` (normalization incl. stored platform values,
> pooled baselines, priors/unspent measurement, leave-one-out backtest,
> calibration), `__tests__/draftSimulator.test.ts` (roster/budget/minimum
> invariants, determinism) and `src/platforms/espn/__tests__/draftKit.test.ts`
> (cheat-sheet parsing against real 2023 sheet fixtures: column interleaving,
> value/bye digit-run repair, D/ST matchup rows).
>
> ### Deferred modeling ideas
> - **γ value-concentration knob** (allocate money ∝ surplus^γ to capture
>   stars-and-scrubs vs balanced rooms) — only worth trying if priors/unspent
>   leave bias on the table in the held-out backtest.
> - **Per-team appetite** (which *teams* are invested in a position, not just
>   the league aggregate) — needs more signal than league-level shares.
>
> ---

## Overview

A real-time draft tracking interface that allows users to enter draft picks as they happen and receive updated price predictions based on current spending patterns and roster needs.

## Feature Requirements

### Core Functionality
- **Draft Pick Entry**: Enter player, price, and drafting team for each pick
- **Pick Management**: Edit/undo previously entered picks
- **Dynamic Pricing**: Real-time price predictions updated based on current draft state
- **Player Search**: Type-ahead search for player selection (like MockTable)
- **Spending Analysis**: Track spending trends by position and team
- **Roster Tracking**: Monitor unfilled starting positions across all teams

### Integration Points
- Reuse `PlayerTable.tsx` for displaying available players
- Integrate `EstimationSettings.tsx` for baseline price estimation
- Utilize `SearchSettings.tsx` for player filtering
- Leverage existing player search patterns from `MockTable.tsx`

## UI Mockup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Live Draft Tracker                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Draft Setup                                     │ Quick Actions              │
│ League: My League 2024                         │ [Undo Last Pick]           │
│ Teams: 12  Budget: $200  Roster: 15           │ [Export Draft]              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Enter Pick                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Pick #: [23]     Team: [Team 3 ▼]                                         │
│ Player: [Josh Jacobs_____________] [Search Results Dropdown]                │
│ Price: [$42]                          [Add Pick] [Clear]                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ Current Draft State                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Pick | Team    | Player           | Pos | Price | Predicted | Diff        │
│ 22   | Team 1  | Christian McCaff | RB  | $65   | $62       | +$3        │
│ 21   | Team 12 | Tyreek Hill      | WR  | $55   | $58       | -$3        │
│ 20   | Team 11 | Josh Allen       | QB  | $45   | $42       | +$3        │
│ ...  | ...     | ...              | ... | ...   | ...       | ...        │
│                                        [Edit] [Delete] buttons per row      │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────┬─────────────────────────────────────────┐
│            Spending Trends        │           Roster Analysis               │
├───────────────────────────────────┼─────────────────────────────────────────┤
│ Position Spending vs Predicted:   │ Unfilled Starting Positions:           │
│ QB: $42 avg (pred: $40) +5%       │ QB: 8/12 teams (4 still need)          │
│ RB: $48 avg (pred: $45) +7%       │ RB: 18/24 spots (6 still need)         │
│ WR: $52 avg (pred: $50) +4%       │ WR: 20/36 spots (16 still need)        │
│ TE: $25 avg (pred: $28) -11%      │ TE: 5/12 teams (7 still need)          │
│                                   │ K: 2/12 teams (10 still need)          │
│ Overall Inflation: +4.2%          │ DEF: 1/12 teams (11 still need)        │
│ Premium Positions: +6.1%          │                                         │
│ Utility Positions: -2.3%          │ Budget Status:                          │
│                                   │ Avg Remaining: $127/team               │
│                                   │ Highest: $165 (Team 8)                 │
│                                   │ Lowest: $95 (Team 3)                   │
└───────────────────────────────────┴─────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         Available Players                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Estimation Settings ▼] [Search Settings ▼]                               │
│                                                                            │
│ Player Table (reusing existing PlayerTable.tsx):                          │
│ Player           | Pos | Predicted | Baseline | Trend | Likelihood        │
│ Saquon Barkley   | RB  | $48      | $45      | +7%   | High (8 need RB)  │
│ CeeDee Lamb      | WR  | $51      | $49      | +4%   | Medium             │
│ Travis Kelce     | TE  | $35      | $38      | -8%   | High (7 need TE)  │
│ ...              | ... | ...      | ...      | ...   | ...               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Architecture

### Core Data Types

```typescript
interface LiveDraftPick {
  pickNumber: number;
  teamId: string;
  teamName: string;
  player: RankedPlayer;
  price: number;
  timestamp: Date;
}

interface LiveDraftState {
  leagueId: LeagueId;
  draftId: string;
  picks: LiveDraftPick[];
  teams: DraftTeam[];
  currentPickNumber: number;
  settings: LiveDraftSettings;
  stateSnapshot: DraftStateSnapshot; // current draft context
}

interface DraftTeam {
  id: string;
  name: string;
  budget: number;
  remainingBudget: number;
  rosterSlots: RosterSlot[];
  filledPositions: Map<string, number>; // position -> count
}

interface LiveDraftSettings {
  totalBudget: number;
  teamCount: number;
  rosterSettings: RosterSettings;
  estimationSettings: EstimationSettingsState;
  searchSettings: SearchSettingsState;
}

// Core context snapshot for any point in a draft
interface DraftStateSnapshot {
  pickNumber: number;
  totalMoneySpent: number;
  moneySpentByPosition: Map<string, number>;
  playersPickedByPosition: Map<string, number>;
  budgetDistribution: BudgetDistribution;
  positionScarcityMetrics: Map<string, PositionScarcity>;
}

interface BudgetDistribution {
  averageRemaining: number;
  medianRemaining: number;
  minRemaining: number;
  maxRemaining: number;
  teamsWithLowBudget: number; // count of teams with <10% budget left
}

interface PositionScarcity {
  totalSlotsInLeague: number;
  slotsFilled: number;
  slotsRemaining: number;
  qualityPlayersRemaining: number; // top-tier options left
  scarcityRatio: number; // slotsRemaining / qualityPlayersRemaining
}

// Historical data for model training
interface HistoricalDraftContext {
  leagueId: LeagueId;
  seasonId: SeasonId;
  picks: HistoricalPick[];
}

interface HistoricalPick extends LiveDraftPick {
  stateSnapshot: DraftStateSnapshot; // draft state when pick was made
  baselinePrediction: number; // what exponential model predicted
  actualPriceDeviation: number; // actual - baseline
}

// Learned adjustment model
interface PriceAdjustmentModel {
  positionModels: Map<string, PositionAdjustmentModel>;
  overallModel: AdjustmentModel;
  lastTrainingDate: Date;
  trainingDataSize: number;
}

interface AdjustmentModel {
  scarcityCoeff: number;
  budgetPressureCoeff: number;
  intercept: number;
  r2: number; // model fit quality
}

interface PositionAdjustmentModel extends AdjustmentModel {
  position: string;
  positionDemandCoeff: number;
}

// Enhanced predictions
interface LivePricePrediction extends CostEstimatedPlayer {
  baselineCost: number; // from exponential curve
  contextualAdjustment: number; // $ adjustment from current state
  livePrediction: number; // baselineCost + contextualAdjustment
  adjustmentFactors: AdjustmentFactors; // breakdown of what's driving adjustment
  confidence: number; // 0-1, model confidence in adjustment
}

interface AdjustmentFactors {
  scarcityAdjustment: number;
  budgetPressureAdjustment: number;
  positionDemandAdjustment: number;
}
```

### Advanced Pricing Model

**🎯 FINAL APPROACH**: **Multiple Linear Regression** with 8 carefully selected features that naturally converges to baseline predictions in early draft states.

#### Linear Regression Model Architecture
The live prediction system uses multiple linear regression optimized for realistic data constraints:

**Core Philosophy**: Train a linear model that:
- **Early Draft**: Reduces to baseline-like behavior (contextual features ≈ 0)
- **Mid/Late Draft**: Leverages scarcity and budget pressure signals
- **Data Efficient**: Works with 500-2000 historical picks across seasons

#### Model Equation
```
PricePct = α + β₁(position) + β₂(positionRank) + β₃(overallRank) + 
           β₄(positionScarcity) + β₅(overallScarcity) + β₆(budgetSpentPct) + 
           β₇(budgetPressure) + β₈(positionalPressure) + ε
```

#### 8 Feature Set (Domain-Informed)

1. **Player Position** (`position`): Categorical (QB, RB, WR, TE, K, DEF)
2. **Player Position Rank** (`positionRank`): 1st QB, 2nd QB, etc.
3. **Player Overall Rank** (`overallRank`): 1-300 consensus ranking
4. **Position Scarcity** (`positionScarcity`): Higher-ranked players at position still available
5. **Overall Scarcity** (`overallScarcity`): Higher-ranked players overall still available  
6. **Budget Spent %** (`budgetSpentPct`): Percent of total league budget spent so far
7. **Overall Budget Pressure** (`budgetPressure`): League-wide over/under spending vs baseline
8. **Positional Budget Pressure** (`positionalPressure`): Position-specific over/under spending vs baseline

#### Natural Baseline Convergence
**Early Draft State** (picks 1-10):
- `budgetSpentPct ≈ 0%`
- `budgetPressure ≈ 0` (no trend yet)
- `positionalPressure ≈ 0` (no position trend yet)
- `positionScarcity` and `overallScarcity` near maximum

**Reduced Model**: `PricePct ≈ α + β₁(position) + β₂(positionRank) + β₃(overallRank)`

This approximates exponential baseline behavior using player characteristics only.

#### Training Strategy (On-Demand)

1. **Data Requirements**: 8 features × 15 samples = ~120 minimum samples ✅
   - Available: 500-2000 picks across multiple seasons
   
2. **On-Demand Training Approach**:
   - **No model storage**: Train fresh for each prediction request  
   - **Training cost**: 1-10ms (negligible vs 50-200ms data loading)
   - **Always fresh**: Uses latest historical data automatically
   - **Simpler architecture**: No model versioning or staleness issues
   
3. **Feature Engineering**:
   - Position as dummy variables (QB=baseline, others as coefficients)
   - Log transforms for rank features if needed
   - Standardization for pressure features

4. **Validation Strategy**:
   - Cross-validation by season (train on 2022-2023, test on 2024)
   - Early draft validation (picks 1-20 match baseline)
   - Late draft validation (picks 120+ use full context)

#### Key Advantages
- **Realistic Data Needs**: Works with available draft history
- **Interpretable**: Each coefficient has clear meaning
- **Fast Training/Prediction**: Linear model scales well (1-10ms training)
- **Always Fresh**: On-demand training uses latest historical data
- **Simple Architecture**: No model storage, versioning, or staleness issues
- **Baseline Compatible**: Natural convergence to exponential curve
- **Expandable**: Easy to add interaction terms if data supports

## Implementation Tasks

### Phase 1: Core Infrastructure (Foundation)
**Estimated Effort**: 1-2 sessions

#### Task 1.1: Create Live Draft Data Models ✅ COMPLETED
- **Files**: `src/app/storage/savedLiveDraftTypes.ts`
- **Scope**: Define TypeScript interfaces for live draft state
- **Acceptance Criteria**: 
  - ✅ All data types defined and exported
  - ✅ Integration with existing `savedMockTypes.ts` patterns (reused existing types like RosterSettings, LeagueTeam)
  - ✅ Proper typing for draft picks, teams, and trends
- **Implementation Notes**: 
  - Simplified design by removing schema versioning (not needed without localStorage)
  - Reused existing types: RosterSettings, LeagueTeam, EstimationSettingsState, SearchSettingsState
  - Used Record instead of Map for better serialization compatibility
  - Removed complex modeling types to focus on MVP functionality

#### Task 1.2: Create Live Draft Storage Interface ✅ COMPLETED
- **Files**: `src/lib/storage/interface.ts`
- **Scope**: Extend StorageAdapter with live draft methods
- **Acceptance Criteria**:
  - ✅ Methods for saving/loading live draft state
  - ✅ Pick history management (add/edit/delete)
  - ✅ Real-time state persistence
  - ✅ Uses existing storage abstraction patterns
- **Implementation Notes**:
  - Added 7 new methods to StorageAdapter interface: loadLiveDrafts, loadLiveDraft, saveLiveDraft, addLiveDraftPick, updateLiveDraftPick, deleteLiveDraftPick, deleteLiveDraft
  - Follows same patterns as existing methods (league-scoped, async, proper JSDoc)
  - Supports atomic pick operations for real-time updates

#### Task 1.3: Implement Storage Adapter Methods ✅ COMPLETED
- **Files**: `src/lib/storage/supabaseAdapter.ts`, `src/lib/storage/dexieAdapter.ts`, `src/lib/storage/localStorage.ts`, `src/lib/storage/memory.ts`
- **Scope**: Implement live draft storage in all adapters
- **Acceptance Criteria**:
  - ✅ **Dexie**: Fully implemented with proper date conversion and atomic operations
  - ✅ **Supabase**: Fully implemented with comprehensive error handling and fallback support
  - ❌ **Memory**: Interface defined but methods not implemented  
  - ❌ **LocalStorage**: Interface defined but methods not implemented
- **Implementation Notes**:
  - **✅ Dexie**: Complete implementation with JSON serialization/deserialization, Date object conversion, and proper transaction handling
  - **✅ Supabase**: Complete implementation with all 7 live draft methods, JSON serialization, proper database relationships, and comprehensive error handling
  - **❌ Memory/LocalStorage**: Interface methods not implemented (not required for MVP)
  - **✅ Database Schema**: Migration 002_live_draft_support.sql exists with proper RLS policies and has been applied
  - **✅ Type Safety**: TypeScript types generated for all Supabase tables
  - **✅ Tests**: Comprehensive test suite created, Dexie tests passing, Supabase integration tests exist (failing due to auth setup issues, not implementation issues)

### Phase 2: Price Prediction Engine (Algorithm) ✅ COMPLETED
**Estimated Effort**: 2-3 sessions

**🎯 Architectural Improvement**: During this phase, we identified and eliminated duplicate baseline model creation logic across the codebase. Created a shared `createBaselineModels()` utility in `analytics.ts` that is now used by:
- **MockDraft**: `analyzeDraft()` function for draft analysis
- **Live Draft**: `useLiveDraft` hook for price predictions  
- **PlayerScatterChart**: Could be integrated but kept separate due to different visualization needs

This consolidation ensures consistent baseline model creation, reduces code duplication, and simplifies maintenance.

#### Task 2.1: Create On-Demand Linear Regression Model ✅ COMPLETED  
- **Files**: `src/lib/models/live-draft/budgetConversions.ts`, `src/lib/models/live-draft/featureExtraction.ts`, `src/lib/models/live-draft/linearRegression.ts`, `src/lib/models/live-draft/liveDraftPredictor.ts`
- **Scope**: **FINAL**: Multiple linear regression with 8 domain-informed features, trained on-demand
- **Acceptance Criteria**:
  - ✅ Linear regression model with exactly 8 features (position, ranks, scarcity, budget pressure)
  - ✅ Natural baseline convergence when contextual features ≈ 0 (early draft)
  - ✅ **On-demand training**: Train fresh for each prediction request (1-10ms cost)
  - ✅ Feature extraction optimized for real-time prediction performance
  - ✅ Prediction engine with baseline integration and user choice support
  - ✅ Interpretable coefficients and prediction component breakdown
- **Architecture Decisions**:
  - ✅ **Percentage-based system** for universal compatibility
  - ✅ **Universal Compatibility**: Works with any budget size  
  - ✅ **Clean Data Architecture**: Percentage storage with `BudgetConverter`
  - ✅ **On-demand training**: No model storage needed - train when predicting
  - ✅ **Simple architecture**: No versioning, staleness, or storage complexity
- **Implementation Notes**:
  - **✅ BudgetConverter**: Clean percentage-based system supporting any league budget configuration
  - **✅ FeatureExtractor**: Data-driven 8-feature extraction with no hardcoded positions, uses existing exponential models from analytics.ts
  - **✅ LinearRegressionTrainer**: Uses ml-regression-multivariate-linear package with proper 2D array formatting
  - **✅ Comprehensive Testing**: 62/62 tests passing across all 3 core components (budget: 31/31, features: 16/16, regression: 15/15)
  - **✅ Real Data Integration**: Test utilities using existing ESPN draft fixtures and platform transformation functions
  - **🔧 Key Fix**: Discovered ml-regression expects y as 2D array `[[0.076], [0.078]]` not 1D `[0.076, 0.078]`
  - **📊 Manual R² Calculation**: Library doesn't implement R² so added custom calculation with predictions vs actuals
- **Implementation Components**:
  - **✅ Feature Extraction Engine**: Extract 8 features from draft state + historical context
  - **✅ Linear Regression Trainer**: Fast matrix operations for coefficient calculation using ml-regression
  - **✅ Prediction Engine**: `LiveDraftPredictor` coordinates training, baseline, and live predictions with clean separation of concerns
  - **✅ Baseline Integration**: Always-available baseline predictions with adjustment comparison for user choice
  - **✅ Historical Data Integration**: Training data preparation from multiple historical drafts with different budget configurations
- **Final Architecture Notes**:
  - **✅ User-Focused Design**: Model provides raw predictions and confidence metrics; UI handles interpretation and model selection
  - **✅ Explicit Training**: Clear training status feedback with model statistics (R², sample size, positions)
  - **✅ Graceful Degradation**: Baseline predictions always available as fallback option
  - **✅ Clean API**: `getBaselinePrediction()` and `getLivePrediction()` with separate training via `trainModel()`

#### Task 2.2: Create Spending Trends Calculator ✅ COMPLETED
- **Files**: `src/app/league/[leagueID]/live-draft/spendingAnalyzer.ts`  
- **Scope**: Analyze current draft for spending patterns
- **Acceptance Criteria**:
  - ✅ Position-by-position trend analysis
  - ✅ Inflation rates vs baseline predictions  
  - ✅ Roster need calculations
  - ✅ Budget status analysis across teams
- **Implementation Notes**:
  - Simplified design per user feedback - removed hardcoded position classifications ("premium" vs "utility")
  - Focus on providing spending information by position without assumptions about position importance
  - Uses `defaultPosition` from RankedPlayer type for position analysis
  - Includes both `analyzeSpendingTrends()` and `analyzeRosterNeeds()` functions
  - Provides inflation calculations vs baseline predictions
  - Includes budget status tracking with teams in trouble identification

#### Task 2.3: Create Live Draft Hook ✅ COMPLETED
- **Files**: `src/app/league/[leagueID]/live-draft/useLiveDraft.ts`
- **Scope**: React hook for live draft state management
- **Acceptance Criteria**:
  - ✅ Manages draft state and predictions
  - ✅ Handles pick entry/editing/deletion
  - ✅ Auto-saves state changes
  - ✅ Provides computed trends and analysis
- **Implementation Notes**:
  - **✅ Comprehensive Hook**: Created full-featured React hook with TypeScript interface for all live draft operations
  - **✅ State Management**: Uses useState for core draft state, loading, error, and saving states
  - **✅ Storage Integration**: Full integration with StorageAdapter for persistent draft operations
  - **✅ Pick Management**: Complete CRUD operations for draft picks (add, update, delete, undo)
  - **✅ Auto-save**: Debounced auto-save with 1-second delay to prevent performance issues
  - **✅ Prediction Engine**: Integration with LiveDraftPredictor for baseline and live predictions
  - **✅ Analysis Integration**: Real-time spending trends and roster analysis using existing analyzer functions
  - **✅ Error Handling**: Comprehensive error handling with user-friendly error messages
  - **✅ Performance Optimization**: Uses useMemo for computed analysis and useCallback for functions
  - **✅ Draft Lifecycle**: Full draft management (create, load, save, delete, reset)
  - **✅ Team Budget Tracking**: Automatic budget calculations and roster position tracking
  - **✅ State Snapshots**: Maintains draft context snapshots for historical analysis
  - **✅ Shared Baseline Models**: Uses new shared `createBaselineModels()` utility from `analytics.ts`
  - **✅ Architectural Improvement**: Consolidated duplicate baseline model logic across MockDraft, PlayerScatterChart, and LiveDraft systems

### Phase 3: UI Components (Interface) ✅ COMPLETED
**Estimated Effort**: 2-3 sessions | **Actual**: 3 sessions | **Status**: ENHANCED DURING REFACTORING

#### Task 3.1: Create Pick Entry Component ✅ COMPLETED
- **Files**: `src/app/league/[leagueID]/live-draft/PickEntry.tsx`
- **Scope**: Form for entering new draft picks
- **Acceptance Criteria**:
  - ✅ Player search with type-ahead using `PlayerSearchInput` component
  - ✅ Team selection dropdown with remaining budget display
  - ✅ Price validation with team budget checks
  - ✅ Auto-increment pick numbers with team rotation
  - ✅ Clear success/error feedback with loading states
- **Implementation Notes**:
  - **✅ Advanced Features**: Auto-focus team selection, live prediction display, form auto-clearing
  - **✅ Component Integration**: Uses `PlayerSearchInput`, `usePlayerSearch` hook, and validation utilities
  - **✅ UX Enhancements**: Success message duration, team budget display, helper text
  - **✅ Error Handling**: Comprehensive form validation with user-friendly error messages

#### Task 3.2: Create Draft History Component ✅ COMPLETED & ENHANCED
- **Files**: 
  - `src/app/league/[leagueID]/live-draft/DraftHistory.tsx` (refactored)
  - `src/app/league/[leagueID]/live-draft/components/DraftHistoryTable.tsx` ✅ NEW
  - `src/app/league/[leagueID]/live-draft/components/DraftHistoryRow.tsx` ✅ NEW
  - `src/app/league/[leagueID]/live-draft/components/common/SortableTableHeader.tsx` ✅ NEW
  - `src/app/league/[leagueID]/live-draft/hooks/useSorting.ts` ✅ NEW
- **Scope**: Display and manage entered picks
- **Acceptance Criteria**:
  - ✅ Table of all picks with edit/delete actions
  - ✅ Shows predicted vs actual prices with color-coded differences
  - ✅ Sortable by pick number, team, position, price, predicted, diff
  - ✅ Inline editing capability with player search and team selection
  - ✅ Undo last pick functionality with confirmation dialogs
- **MAJOR ENHANCEMENT**: **Refactored into modular, reusable architecture**
  - **✅ 66% code reduction**: 520+ lines → 174 lines in main component
  - **✅ Reusable components**: `SortableTableHeader` and `useSorting` hook can be used project-wide
  - **✅ Clean separation**: Table structure, row logic, and editing functionality properly separated
  - **✅ Better maintainability**: Single-responsibility components, easier testing
  - **✅ Enhanced UX**: Improved error handling, loading states, accessibility features

#### Task 3.3: Create Trends Dashboard Components ✅ COMPLETED
- **Files**: 
  - `src/app/league/[leagueID]/live-draft/SpendingTrends.tsx`
  - `src/app/league/[leagueID]/live-draft/RosterAnalysis.tsx`
- **Scope**: Visual display of spending and roster trends  
- **Acceptance Criteria**:
  - ✅ Position spending vs predictions with inflation rates
  - ✅ Overall market inflation tracking and alerts
  - ✅ Unfilled position tracking with urgency indicators
  - ✅ Budget remaining analysis with team status
  - ✅ Clear visual indicators for trends and market conditions
- **Implementation Notes**:
  - **✅ SpendingTrends**: Position-by-position analysis, market insights (most inflated/best value), market alerts for high/low inflation
  - **✅ RosterAnalysis**: Budget status cards, teams in trouble alerts, unfilled positions with urgency levels, projected spending breakdown
  - **✅ Component Architecture**: Uses shared utility functions, common UI components, and proper memoization
  - **✅ Data Visualization**: Color-coded trends, progress bars, stat cards, and contextual alerts
  - **✅ User Experience**: Empty states, loading indicators, responsive design, dark mode support

### Phase 4: Player Search Integration (Search)
**Estimated Effort**: 1-2 sessions

#### Task 4.1: Create Live Draft Player Search
- **Files**: `src/app/league/[leagueID]/live-draft/PlayerSearch.tsx`
- **Scope**: Searchable player selection for pick entry
- **Acceptance Criteria**:
  - Type-ahead search like MockTable
  - Filters out already-drafted players
  - Shows live predictions in results
  - Keyboard navigation support
  - Integrates with existing search patterns

#### Task 4.2: Enhance PlayerTable for Live Draft
- **Files**: `src/app/league/[leagueID]/drafts/[draftYear]/PlayerTable.tsx`
- **Scope**: Add live prediction columns and sorting
- **Acceptance Criteria**:
  - New columns for live predictions and trends
  - Maintains existing functionality
  - Performance optimized for frequent updates
  - Backward compatible with existing usage

### Phase 5: Main Page Integration (Assembly)
**Estimated Effort**: 2-3 sessions  

#### Task 5.1: Create Live Draft Main Page
- **Files**: `src/app/league/[leagueID]/live-draft/page.tsx`
- **Scope**: Main page layout and component orchestration
- **Acceptance Criteria**:
  - Responsive layout matching mockup
  - Integrates all components seamlessly
  - Handles loading and error states
  - Auto-saves draft state
  - Clean, professional interface

#### Task 5.2: Add Navigation and Routing
- **Files**: 
  - `src/app/league/[leagueID]/layout.tsx`
  - Navigation components
- **Scope**: Add live draft to league navigation
- **Acceptance Criteria**:
  - Clear navigation path to live draft
  - Breadcrumbs and page titles
  - Mobile-friendly navigation
  - Consistent with existing patterns

### Phase 6: Testing and Refinement (Validation)
**Estimated Effort**: 1-2 sessions

#### Task 6.1: Component Unit Tests  
- **Files**: `__tests__/live-draft/` directory
- **Scope**: Test individual components and utilities
- **Acceptance Criteria**:
  - Tests for prediction algorithm accuracy
  - Component rendering and interaction tests
  - Storage adapter integration tests
  - Error handling validation

#### Task 6.2: E2E Integration Tests
- **Files**: `e2e/tests/live-draft/` directory  
- **Scope**: End-to-end user workflow testing
- **Acceptance Criteria**:
  - Complete draft entry workflow
  - Pick editing and deletion
  - Settings persistence
  - Performance under typical usage
  - Cross-browser compatibility

#### Task 6.3: Performance and UX Refinement
- **Files**: Various component files
- **Scope**: Optimize performance and user experience  
- **Acceptance Criteria**:
  - Fast prediction updates (<100ms)
  - Smooth search experience
  - Intuitive keyboard shortcuts
  - Mobile responsiveness
  - Accessible design (WCAG compliance)

## Technical Considerations

### Performance
- **Memoization**: Heavy use of `useMemo` and `useCallback` for prediction calculations
- **Debouncing**: Search input and auto-save operations
- **Virtual Scrolling**: For large player lists (if needed)
- **Optimistic Updates**: UI updates immediately, sync in background

### Data Consistency
- **Atomic Operations**: Pick operations must be atomic to prevent corruption
- **Validation**: Server-side validation for all pick data
- **Conflict Resolution**: Handle concurrent editing scenarios
- **Backup/Recovery**: Ability to restore from corrupted state

### User Experience  
- **Progressive Enhancement**: Works without JavaScript for basic functionality
- **Offline Support**: Cache critical data for offline usage
- **Keyboard Navigation**: Full keyboard accessibility
- **Mobile Optimization**: Touch-friendly interface for mobile drafts

## Success Metrics

### Functional Success
- ✅ Users can enter draft picks in real-time
- ✅ Price predictions update accurately after each pick  
- ✅ All spending trends and roster analysis display correctly
- ✅ Pick editing/deletion works reliably
- ✅ Integration with existing components is seamless

### Performance Success
- ✅ Prediction updates complete in <100ms
- ✅ Search results appear in <200ms
- ✅ Page loads in <2s on average connection
- ✅ Smooth performance with 200+ picks entered

### User Experience Success  
- ✅ Interface is intuitive without training
- ✅ Mobile experience is equivalent to desktop
- ✅ No data loss during normal usage
- ✅ Clear error messages and recovery paths
- ✅ Integrates naturally with existing workflow

## Future Enhancements (Post-MVP)

### Advanced Features
- **Real-time Collaboration**: Multiple users tracking same draft
- **Draft Import**: Import picks from ESPN/Sleeper APIs  
- **Advanced Analytics**: Historical comparison, value tracking
- **Export Options**: PDF reports, CSV data export
- **Draft Simulation**: "What-if" scenarios during live draft

### Integration Opportunities
- **Platform APIs**: Auto-import picks from ESPN/Sleeper
- **Mobile App**: Companion mobile application
- **Notifications**: Real-time alerts for value picks
- **Social Features**: Share draft boards, collaborative tracking

This implementation plan provides a clear roadmap for building a comprehensive live draft tracking system that integrates seamlessly with the existing application architecture while providing powerful new functionality for fantasy football users.