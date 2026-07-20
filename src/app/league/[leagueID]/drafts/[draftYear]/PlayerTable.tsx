'use client'
import Tooltip from '@/ui/Tooltip';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PositionBadge } from '@/ui/Badge';

type PlayerData<T extends object> = { id: any; } & T;

export type ColumnName = string | {
    name: string;
    shortName?: string;
    tooltip?: string;
    /** Hide this column below the given breakpoint (CSS-only; cells stay in the DOM). */
    hideBelow?: 'sm' | 'md';
    /** Custom cell renderer for this column's value. */
    format?: (value: unknown) => React.ReactNode;
};

export interface PlayerTableProps<T extends object> {
    players: PlayerData<T>[];
    columns: [(keyof T), ColumnName][];
    defaultSortColumn?: keyof T;
    defaultSortDirection?: 'asc' | 'desc';
    onPlayerClick?: (player: PlayerData<T>) => void;
    /** Compact metadata rendered under the first column's value on small screens
     *  (for columns that are hidden below `sm`). */
    mobileSecondary?: (player: PlayerData<T>) => React.ReactNode;
}

const hiddenClasses = {
    sm: 'hidden sm:table-cell',
    md: 'hidden md:table-cell',
};

function columnHiddenClass(name: ColumnName): string {
    return typeof name === 'object' && name.hideBelow ? hiddenClasses[name.hideBelow] : '';
}

const PlayerTable = <T extends object,>({
    players,
    columns,
    defaultSortColumn = columns[0][0],
    defaultSortDirection = 'desc',
    onPlayerClick,
    mobileSecondary,
}: PlayerTableProps<T>) => {
    type SortColumn = keyof T;
    const [sortColumn, setSortColumn] = useState<SortColumn>(defaultSortColumn);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection);

    // Edge-fade affordances: show a gradient on whichever side has more content.
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    const updateScrollState = useCallback(() => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 2);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    }, []);

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        updateScrollState();
        el.addEventListener('scroll', updateScrollState, { passive: true });
        let resizeObserver: ResizeObserver | undefined;
        if (typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(updateScrollState);
            resizeObserver.observe(el);
        }
        return () => {
            el.removeEventListener('scroll', updateScrollState);
            resizeObserver?.disconnect();
        };
    }, [updateScrollState]);

    const handleSort = (column: SortColumn) => {
        if (column === sortColumn) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const sortedData = [...players].sort((a, b) => {
        const aValue = a[sortColumn];
        const bValue = b[sortColumn];

        if (aValue < bValue) {
            return sortDirection === 'asc' ? -1 : 1;
        } else if (aValue > bValue) {
            return sortDirection === 'asc' ? 1 : -1;
        } else {
            return 0;
        }
    });

    // Right-align numeric columns (with tabular figures) based on the first row's value.
    const isNumericColumn = (column: keyof T): boolean =>
        sortedData.length > 0 && typeof sortedData[0][column] === 'number';

    return (
        <div className="relative w-full my-5">
            <div
                ref={scrollRef}
                className="mx-auto border-collapse w-full max-h-[90dvh] overflow-y-auto overflow-x-auto rounded-lg shadow-sm border border-gray-100 dark:border-gray-700"
            >
                <table data-testid="available-players-table" className="table-auto w-full">
                    <thead>
                        <tr>
                            {columns.map(([column, name], i) => (
                                <th
                                    key={column.toString()}
                                    className={`max-w-fit md:w-max md:max-w-max px-2 sm:px-3 py-3
                                                ${i === columns.length - 1 ? 'pl-2 sm:pl-3 pr-3 sm:pr-4' : ''}
                                                ${columnHiddenClass(name)}
                                                sticky top-0
                                                border-b-2 border-gray-200 dark:border-gray-600
                                                font-semibold
                                                bg-gray-50 text-gray-900
                                                dark:bg-gray-900 dark:text-gray-100
                                                ${isNumericColumn(column) ? 'text-right' : 'text-left'}`}
                                    >
                                    <div className={`inline justify-start items-center w-max cursor-pointer hover:text-primary-600`}>
                                        <ColumnHeader
                                            name={name}
                                            onClick={() => handleSort(column)}
                                            sortIndicator={column === sortColumn ? (sortDirection === 'asc' ? '▲' : '▼') : undefined}
                                        />
                                    </div>
                                </th>))}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedData.map((item, i) => (
                            <tr key={item.id}
                                data-testid={`player-row-${item.id}`}
                                className={`transition-colors
                                            ${i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-900/40'}
                                            ${onPlayerClick ? 'cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-900/20' : ''}
                                            border-b border-gray-100 dark:border-gray-700`}
                                onClick={() => onPlayerClick && onPlayerClick(item)}>
                                {columns.map(([column, name], j) => {
                                    const value = item[column];
                                    const columnStr = column.toString();
                                    const isPosition = columnStr === 'position' || columnStr === 'defaultPosition';
                                    const positionValue = value?.toString();
                                    const format = typeof name === 'object' ? name.format : undefined;

                                    return (
                                        <td key={`${columnStr} ${item.id}`}
                                            data-testid={`player-cell-${item.id}-${columnStr}`}
                                            className={`py-3 whitespace-nowrap text-ellipsis text-gray-700 dark:text-gray-300
                                                        ${columnHiddenClass(name)}
                                                        ${isNumericColumn(column) ? 'text-right tabular-nums' : 'text-left'}
                                                        ${j === columns.length - 1 ? 'pl-2 sm:pl-3 pr-3 sm:pr-4' : 'px-2 sm:px-3'}`} >
                                            <div>
                                                {isPosition && positionValue ? (
                                                    <PositionBadge position={positionValue} />
                                                ) : format ? (
                                                    format(value)
                                                ) : (
                                                    value?.toString()
                                                )}
                                                {j === 0 && mobileSecondary && (
                                                    <div className="sm:hidden text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                        {mobileSecondary(item)}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {/* Scroll affordances: fade the clipped edge so overflow is never invisible */}
            {canScrollLeft && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-lg bg-gradient-to-r from-white dark:from-gray-800 to-transparent" />
            )}
            {canScrollRight && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-lg bg-gradient-to-l from-white dark:from-gray-800 to-transparent" />
            )}
        </div>
    );
};

export default PlayerTable;

const ColumnHeader: React.FC<{name: ColumnName, onClick: () => void, sortIndicator?: string}> = ({ name, onClick, sortIndicator }) => {
    if (typeof name === 'string') {
        return (
            <span onClick={onClick} className="flex items-center">
                {name}
                <span className="ml-1 w-3 text-center">{sortIndicator || ''}</span>
            </span>
        );
    }

    const createHeaderContent = (nm: String) => {
        const content = (
            <div onClick={onClick} className='cursor-pointer flex items-center'>
                <span>{nm}</span>
                <span className="ml-1 w-3 text-center">{sortIndicator || ''}</span>
            </div>
        );

        if (name.tooltip) {
            return (
                <div className="flex items-center">
                    <Tooltip text={name.tooltip}>
                        <div onClick={onClick} className='cursor-pointer'>
                            {nm}
                        </div>
                    </Tooltip>
                    <span className="ml-1 w-3 text-center">{sortIndicator || ''}</span>
                </div>
            );
        }
        return content;
    };

    return [
        <span key={`short ${name.shortName}`} className='inline md:hidden'>{createHeaderContent(name.shortName ?? name.name)}</span>,
        <span key={name.name} className='hidden md:inline'>{createHeaderContent(name.name)}</span>
    ];
};
