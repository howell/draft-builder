# Live Draft Price Tracking Implementation Plan

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

The live prediction engine builds upon the existing exponential curve system (`src/app/league/analytics.ts`) by adding contextual adjustments based on live draft state:

#### Phase 1: Historical Context Analysis
1. **Draft State Extraction**: For each historical pick, capture draft context:
   - Total money spent so far in draft
   - Money spent per position so far
   - Players drafted per position count
   - Budget distribution across teams
   - Position scarcity metrics

2. **Baseline Deviation Analysis**: Calculate how actual historical prices deviated from exponential curve predictions

3. **State-Adjustment Correlation Model**: Build predictive model learning how draft state factors correlate with price adjustments relative to baseline

#### Phase 2: Live Application
1. **Real-time State Calculation**: Extract same contextual factors from current draft
2. **Dynamic Adjustment Prediction**: Apply learned model to predict price adjustments for current state  
3. **Enhanced Price Prediction**: Adjust baseline exponential predictions using contextual factors

#### Key Contextual Factors (MVP)
- **Position Scarcity**: Unfilled roster slots vs remaining quality players
- **Budget Pressure**: Teams with low remaining budgets behave differently
- **Roster Desperation**: Teams missing starting positions for that role

## Implementation Tasks

### Phase 1: Core Infrastructure (Foundation)
**Estimated Effort**: 1-2 sessions

#### Task 1.1: Create Live Draft Data Models
- **Files**: `src/app/storage/savedLiveDraftTypes.ts`
- **Scope**: Define TypeScript interfaces for live draft state
- **Acceptance Criteria**: 
  - All data types defined and exported
  - Integration with existing `savedMockTypes.ts` patterns
  - Proper typing for draft picks, teams, and trends

#### Task 1.2: Create Live Draft Storage Interface
- **Files**: `src/lib/storage/interface.ts`
- **Scope**: Extend StorageAdapter with live draft methods
- **Acceptance Criteria**:
  - Methods for saving/loading live draft state
  - Pick history management (add/edit/delete)
  - Real-time state persistence
  - Uses existing storage abstraction patterns

#### Task 1.3: Implement Storage Adapter Methods
- **Files**: `src/lib/storage/supabaseAdapter.ts`, `src/lib/storage/dexieAdapter.ts`
- **Scope**: Implement live draft storage in all adapters
- **Acceptance Criteria**:
  - Consistent behavior across all storage types
  - Proper error handling and validation
  - Atomic operations for pick management

### Phase 2: Price Prediction Engine (Algorithm)
**Estimated Effort**: 2-3 sessions

#### Task 2.1: Create Live Prediction Algorithm
- **Files**: `src/app/league/[leagueID]/live-draft/livePredictionEngine.ts`
- **Scope**: Core algorithm for dynamic price prediction
- **Acceptance Criteria**:
  - Combines baseline + live trends + supply/demand
  - Updates predictions after each pick
  - Handles edge cases (no picks yet, position scarcity)
  - Performance optimized for real-time updates

#### Task 2.2: Create Spending Trends Calculator
- **Files**: `src/app/league/[leagueID]/live-draft/spendingAnalyzer.ts`  
- **Scope**: Analyze current draft for spending patterns
- **Acceptance Criteria**:
  - Position-by-position trend analysis
  - Premium vs utility position inflation tracking
  - Inflation rates vs baseline predictions
  - Roster need calculations

#### Task 2.3: Create Live Draft Hook
- **Files**: `src/app/league/[leagueID]/live-draft/useLiveDraft.ts`
- **Scope**: React hook for live draft state management
- **Acceptance Criteria**:
  - Manages draft state and predictions
  - Handles pick entry/editing/deletion
  - Auto-saves state changes
  - Provides computed trends and analysis

### Phase 3: UI Components (Interface)
**Estimated Effort**: 2-3 sessions

#### Task 3.1: Create Pick Entry Component
- **Files**: `src/app/league/[leagueID]/live-draft/PickEntry.tsx`
- **Scope**: Form for entering new draft picks
- **Acceptance Criteria**:
  - Player search with type-ahead (reuse MockTable patterns)
  - Team selection dropdown
  - Price validation
  - Auto-increment pick numbers
  - Clear success/error feedback

#### Task 3.2: Create Draft History Component  
- **Files**: `src/app/league/[leagueID]/live-draft/DraftHistory.tsx`
- **Scope**: Display and manage entered picks
- **Acceptance Criteria**:
  - Table of all picks with edit/delete actions
  - Shows predicted vs actual prices
  - Sortable by pick number, team, position
  - Inline editing capability
  - Undo last pick functionality

#### Task 3.3: Create Trends Dashboard Components
- **Files**: 
  - `src/app/league/[leagueID]/live-draft/SpendingTrends.tsx`
  - `src/app/league/[leagueID]/live-draft/RosterAnalysis.tsx`
- **Scope**: Visual display of spending and roster trends  
- **Acceptance Criteria**:
  - Position spending vs predictions
  - Premium vs utility position inflation
  - Unfilled position tracking
  - Budget remaining analysis
  - Clear visual indicators for trends

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