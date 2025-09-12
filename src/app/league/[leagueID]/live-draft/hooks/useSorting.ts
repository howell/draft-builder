'use client';

import { useState, useCallback, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface UseSortingOptions<T extends string> {
  defaultColumn: T;
  defaultDirection?: SortDirection;
}

export interface UseSortingReturn<T extends string> {
  sortColumn: T;
  sortDirection: SortDirection;
  handleSort: (column: T) => void;
  sortData: <D extends Record<T, any>>(data: D[]) => D[];
}

/**
 * Generic sorting hook for table data
 */
export function useSorting<T extends string>({
  defaultColumn,
  defaultDirection = 'desc'
}: UseSortingOptions<T>): UseSortingReturn<T> {
  const [sortColumn, setSortColumn] = useState<T>(defaultColumn);
  const [sortDirection, setSortDirection] = useState<SortDirection>(defaultDirection);

  const handleSort = useCallback((column: T) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  const sortData = useCallback(<D extends Record<T, any>>(data: D[]): D[] => {
    return [...data].sort((a, b) => {
      let aVal: any = a[sortColumn];
      let bVal: any = b[sortColumn];

      // Handle string sorting
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      // Handle null/undefined values
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDirection === 'asc' ? -1 : 1;
      if (bVal == null) return sortDirection === 'asc' ? 1 : -1;

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [sortColumn, sortDirection]);

  return {
    sortColumn,
    sortDirection,
    handleSort,
    sortData
  };
}

// Specialized hook for draft history sorting
export type DraftHistorySortColumn = 'pickNumber' | 'teamName' | 'playerName' | 'position' | 'price' | 'predicted' | 'diff';

export interface UseDraftHistorySortingReturn extends UseSortingReturn<DraftHistorySortColumn> {
  // Add any draft-specific sorting methods here if needed
}

export function useDraftHistorySorting(): UseDraftHistorySortingReturn {
  return useSorting<DraftHistorySortColumn>({
    defaultColumn: 'pickNumber',
    defaultDirection: 'desc'
  });
}