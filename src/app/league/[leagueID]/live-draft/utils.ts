import { LIVE_DRAFT_CONSTANTS, InflationLevel, BudgetStatus, PositionUrgency } from './constants';
import { PositionSpending, PositionNeed } from '@/app/storage/savedLiveDraftTypes';

/**
 * Validation utilities
 */
export const validation = {
  /**
   * Validates and parses price input
   */
  parsePrice: (value: string): number | null => {
    if (!value || value.trim() === '') return null;
    
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed <= 0) return null;
    
    return parsed;
  },

  /**
   * Validates if price is within team budget
   */
  isPriceValid: (price: number, remainingBudget: number): boolean => {
    return price > 0 && price <= remainingBudget;
  },

  /**
   * Gets validation error message for price
   */
  getPriceError: (price: string, remainingBudget: number): string | null => {
    const parsedPrice = validation.parsePrice(price);
    
    if (parsedPrice === null) {
      return 'Please enter a valid price';
    }
    
    if (parsedPrice > remainingBudget) {
      return `Price exceeds team's remaining budget of $${remainingBudget}`;
    }
    
    return null;
  }
};

/**
 * Formatting utilities
 */
export const format = {
  /**
   * Formats currency value
   */
  currency: (amount: number): string => {
    return `$${Math.round(amount)}`;
  },

  /**
   * Formats percentage with sign
   */
  percentage: (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  },

  /**
   * Formats percentage without sign
   */
  percentageAbsolute: (value: number): string => {
    return `${value.toFixed(1)}%`;
  },

  /**
   * Formats price difference with sign
   */
  priceDifference: (difference: number): string => {
    const sign = difference > 0 ? '+' : '';
    return `${sign}${format.currency(difference)}`;
  }
};

/**
 * Classification utilities
 */
export const classify = {
  /**
   * Determines inflation level based on rate
   */
  inflationLevel: (inflationRate: number): InflationLevel => {
    if (inflationRate > LIVE_DRAFT_CONSTANTS.HIGH_INFLATION_THRESHOLD) return 'high';
    if (inflationRate > LIVE_DRAFT_CONSTANTS.MEDIUM_INFLATION_THRESHOLD) return 'medium';
    if (inflationRate > 0) return 'low';
    return 'negative';
  },

  /**
   * Determines budget status based on remaining percentage
   */
  budgetStatus: (remainingPct: number): BudgetStatus => {
    if (remainingPct < LIVE_DRAFT_CONSTANTS.BUDGET_THRESHOLDS.CRITICAL) return 'critical';
    if (remainingPct < LIVE_DRAFT_CONSTANTS.BUDGET_THRESHOLDS.WARNING) return 'warning';
    return 'safe';
  },

  /**
   * Determines position urgency based on filled percentage
   */
  positionUrgency: (position: PositionNeed): PositionUrgency => {
    const filledPct = (position.filledSlots / position.totalSlots) * 100;
    
    if (filledPct < LIVE_DRAFT_CONSTANTS.POSITION_URGENCY.HIGH) return 'high';
    if (filledPct < LIVE_DRAFT_CONSTANTS.POSITION_URGENCY.MEDIUM) return 'medium';
    if (filledPct < LIVE_DRAFT_CONSTANTS.POSITION_URGENCY.LOW) return 'low';
    return 'minimal';
  }
};

/**
 * UI utilities
 */
export const ui = {
  /**
   * Gets badge variant for inflation level
   */
  getInflationBadgeVariant: (inflationRate: number) => {
    const level = classify.inflationLevel(inflationRate);
    switch (level) {
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
      case 'negative': return 'success';
    }
  },

  /**
   * Gets badge variant for budget status
   */
  getBudgetBadgeVariant: (remainingPct: number) => {
    const status = classify.budgetStatus(remainingPct);
    switch (status) {
      case 'critical': return 'error';
      case 'warning': return 'warning';
      case 'safe': return 'success';
    }
  },

  /**
   * Gets text color for budget status
   */
  getBudgetStatusColor: (remainingPct: number): string => {
    const status = classify.budgetStatus(remainingPct);
    switch (status) {
      case 'critical': return 'text-red-600 dark:text-red-400';
      case 'warning': return 'text-yellow-600 dark:text-yellow-400';
      case 'safe': return 'text-green-600 dark:text-green-400';
    }
  },

  /**
   * Gets urgency info for position need
   */
  getPositionUrgencyInfo: (position: PositionNeed) => {
    const urgency = classify.positionUrgency(position);
    
    switch (urgency) {
      case 'high':
        return { 
          level: 'high' as const, 
          color: 'text-red-600 dark:text-red-400', 
          label: 'High Need',
          variant: 'error' as const
        };
      case 'medium':
        return { 
          level: 'medium' as const, 
          color: 'text-yellow-600 dark:text-yellow-400', 
          label: 'Medium Need',
          variant: 'warning' as const
        };
      case 'low':
        return { 
          level: 'low' as const, 
          color: 'text-blue-600 dark:text-blue-400', 
          label: 'Low Need',
          variant: 'info' as const
        };
      case 'minimal':
        return { 
          level: 'minimal' as const, 
          color: 'text-gray-600 dark:text-gray-400', 
          label: 'Minimal Need',
          variant: 'secondary' as const
        };
    }
  },

  /**
   * Gets color class for price difference
   */
  getPriceDifferenceColor: (difference: number): string => {
    return difference > 0 
      ? 'text-red-600 dark:text-red-400' 
      : 'text-green-600 dark:text-green-400';
  }
};

/**
 * Array utilities
 */
export const arrays = {
  /**
   * Sorts positions by inflation rate (highest first)
   */
  sortPositionsByInflation: (positions: PositionSpending[]): PositionSpending[] => {
    return [...positions].sort((a, b) => b.inflationRate - a.inflationRate);
  },

  /**
   * Sorts positions by average price (highest first)
   */
  sortPositionsByPrice: (positions: PositionSpending[], totalBudget: number): PositionSpending[] => {
    return [...positions].sort((a, b) => 
      (b.averagePricePct * totalBudget) - (a.averagePricePct * totalBudget)
    );
  },

  /**
   * Sorts unfilled positions by urgency (most urgent first)
   */
  sortUnfilledPositionsByUrgency: (positions: PositionNeed[]): PositionNeed[] => {
    return [...positions]
      .filter(pos => pos.totalSlots > pos.filledSlots)
      .sort((a, b) => {
        const aUrgency = classify.positionUrgency(a);
        const bUrgency = classify.positionUrgency(b);
        const urgencyOrder = { high: 3, medium: 2, low: 1, minimal: 0 };
        
        // Sort by urgency first, then by remaining slots
        const urgencyDiff = urgencyOrder[bUrgency] - urgencyOrder[aUrgency];
        if (urgencyDiff !== 0) return urgencyDiff;
        
        return (b.totalSlots - b.filledSlots) - (a.totalSlots - a.filledSlots);
      });
  }
};