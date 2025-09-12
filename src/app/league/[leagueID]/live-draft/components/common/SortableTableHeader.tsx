'use client';

import React from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortableTableHeaderProps {
  children: React.ReactNode;
  sortKey: string;
  currentSortKey?: string;
  currentSortDirection?: SortDirection;
  onSort: (key: string) => void;
  className?: string;
}

const SortableTableHeader: React.FC<SortableTableHeaderProps> = ({
  children,
  sortKey,
  currentSortKey,
  currentSortDirection,
  onSort,
  className = ''
}) => {
  const isActive = currentSortKey === sortKey;
  
  const getSortIcon = () => {
    if (!isActive) return '↕️';
    return currentSortDirection === 'asc' ? '↑' : '↓';
  };

  const handleClick = () => {
    onSort(sortKey);
  };

  return (
    <th 
      className={`px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${className}`}
      onClick={handleClick}
      role="columnheader"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      aria-sort={
        isActive 
          ? currentSortDirection === 'asc' ? 'ascending' : 'descending'
          : 'none'
      }
    >
      <div className="flex items-center gap-1">
        <span>{children}</span>
        <span className="text-gray-400" aria-hidden="true">
          {getSortIcon()}
        </span>
      </div>
    </th>
  );
};

export default SortableTableHeader;