// Live Draft Constants
export const LIVE_DRAFT_CONSTANTS = {
  // Player search
  MAX_PLAYER_SUGGESTIONS: 8,
  SEARCH_DEBOUNCE_DELAY: 300,
  
  // Budget defaults
  DEFAULT_TOTAL_BUDGET: 200,
  DEFAULT_TEAM_COUNT: 12,
  
  // Inflation thresholds
  HIGH_INFLATION_THRESHOLD: 10,
  MEDIUM_INFLATION_THRESHOLD: 5,
  LOW_BUDGET_WARNING_THRESHOLD: 10,
  CRITICAL_BUDGET_WARNING: 20,
  
  // UI timing
  SUCCESS_MESSAGE_DURATION: 2000,
  AUTO_SAVE_DEBOUNCE: 1000,
  
  // Draft settings
  DEFAULT_ROSTER_SIZE: 15,
  
  // Budget status thresholds (percentages)
  BUDGET_THRESHOLDS: {
    CRITICAL: 10,
    WARNING: 25,
    SAFE: 50
  },
  
  // Position urgency thresholds (filled percentages)
  POSITION_URGENCY: {
    HIGH: 25,
    MEDIUM: 50,
    LOW: 75
  }
} as const;

// Type for inflation levels
export type InflationLevel = 'high' | 'medium' | 'low' | 'negative';

// Type for budget status
export type BudgetStatus = 'critical' | 'warning' | 'safe';

// Type for position urgency
export type PositionUrgency = 'high' | 'medium' | 'low' | 'minimal';