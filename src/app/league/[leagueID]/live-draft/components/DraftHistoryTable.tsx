'use client';

import React from 'react';
import { SortableTableHeader, SortDirection } from './common';

export type SortColumn = 'pickNumber' | 'teamName' | 'playerName' | 'position' | 'price' | 'predicted' | 'diff';

export interface DraftHistoryTableProps {
  children: React.ReactNode;
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (column: SortColumn) => void;
  className?: string;
}

const DraftHistoryTable: React.FC<DraftHistoryTableProps> = ({
  children,
  sortColumn,
  sortDirection,
  onSort,
  className = ''
}) => {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            <SortableTableHeader
              sortKey="pickNumber"
              currentSortKey={sortColumn}
              currentSortDirection={sortDirection}
              onSort={(key) => onSort(key as SortColumn)}
            >
              Pick
            </SortableTableHeader>

            <SortableTableHeader
              sortKey="teamName"
              currentSortKey={sortColumn}
              currentSortDirection={sortDirection}
              onSort={(key) => onSort(key as SortColumn)}
            >
              Team
            </SortableTableHeader>

            <SortableTableHeader
              sortKey="playerName"
              currentSortKey={sortColumn}
              currentSortDirection={sortDirection}
              onSort={(key) => onSort(key as SortColumn)}
            >
              Player
            </SortableTableHeader>

            <SortableTableHeader
              sortKey="position"
              currentSortKey={sortColumn}
              currentSortDirection={sortDirection}
              onSort={(key) => onSort(key as SortColumn)}
            >
              Pos
            </SortableTableHeader>

            <SortableTableHeader
              sortKey="price"
              currentSortKey={sortColumn}
              currentSortDirection={sortDirection}
              onSort={(key) => onSort(key as SortColumn)}
            >
              Price
            </SortableTableHeader>

            <SortableTableHeader
              sortKey="predicted"
              currentSortKey={sortColumn}
              currentSortDirection={sortDirection}
              onSort={(key) => onSort(key as SortColumn)}
            >
              Predicted
            </SortableTableHeader>

            <SortableTableHeader
              sortKey="diff"
              currentSortKey={sortColumn}
              currentSortDirection={sortDirection}
              onSort={(key) => onSort(key as SortColumn)}
            >
              Diff
            </SortableTableHeader>

            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
          {children}
        </tbody>
      </table>
    </div>
  );
};

export default DraftHistoryTable;