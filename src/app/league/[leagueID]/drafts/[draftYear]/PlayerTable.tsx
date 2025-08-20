'use client'
import Tooltip from '@/ui/Tooltip';
import React, { useState } from 'react';
import { PositionBadge } from '@/ui/Badge';

type PlayerData<T extends object> = { id: any; } & T;

export type ColumnName = string | {
    name: string;
    shortName?: string;
    tooltip?: string;
};

export interface PlayerTableProps<T extends object> {
    players: PlayerData<T>[];
    columns: [(keyof T), ColumnName][];
    defaultSortColumn?: keyof T;
    defaultSortDirection?: 'asc' | 'desc';
    onPlayerClick?: (player: PlayerData<T>) => void;
}


const PlayerTable = <T extends object,>({
    players,
    columns,
    defaultSortColumn = columns[0][0],
    defaultSortDirection = 'desc',
    onPlayerClick,
}: PlayerTableProps<T>) => {
    type SortColumn = keyof T;
    const [sortColumn, setSortColumn] = useState<SortColumn>(defaultSortColumn);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(defaultSortDirection);

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

    const getSortClass = (column: SortColumn) => {
        if (column === sortColumn) {
            return sortDirection === 'asc' ? 'after:content-["▲"]' : 'after:content-["▼"]';
        }
        return '';
    };

    return (
        <div className="mx-auto my-5 border-collapse w-full max-h-[90dvh] overflow-y-auto overflow-x-auto md:overflow-x-hidden rounded-lg shadow-sm">
            <table data-testid="available-players-table" className="table-auto w-full">
                <thead>
                    <tr>
                        {columns.map(([column, name], i) => (
                            <th
                                key={column.toString()}
                                className={`max-w-fit md:w-max md:max-w-max px-3 py-3 
                                            ${i === columns.length - 1 ? 'pl-3 pr-4' : 'mx-2'}
                                            sticky top-0
                                            border-b-2 border-gray-200 dark:border-gray-700
                                            text-left font-semibold
                                            bg-gradient-to-r from-gray-50 to-gray-100 text-gray-900
                                            dark:from-gray-800 dark:to-gray-750 dark:text-gray-100
                                            ${getSortClass(column)}`}
                                >
                                <div className="inline justify-start items-center w-max cursor-pointer hover:text-primary-600">
                                    <ColumnHeader name={name} onClick={() => handleSort(column)} />
                                </div>
                            </th>))}
                    </tr>
                </thead>
                <tbody>
                    {sortedData.map((item, i) => (
                        <tr key={item.id}
                            data-testid={`player-row-${item.id}`}
                            className={`transition-colors
                                        ${i % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-850'}
                                        ${onPlayerClick ? 'cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-900/20' : ''}
                                        border-b border-gray-100 dark:border-gray-700`}
                            onClick={() => onPlayerClick && onPlayerClick(item)}>
                            {columns.map(([column, _], j) => {
                                const value = item[column];
                                const columnStr = column.toString();
                                const isPosition = columnStr === 'position' || columnStr === 'defaultPosition';
                                const positionValue = value?.toString();
                                
                                return (
                                    <td key={`${columnStr} ${item.id}`}
                                        data-testid={`player-cell-${item.id}-${columnStr}`}
                                        className={`py-3 text-left whitespace-nowrap text-ellipsis text-gray-700 dark:text-gray-300
                                                    ${j === columns.length - 1 ? 'pl-3 pr-4' : 'px-3'}`} >
                                        <div>
                                            {isPosition && positionValue ? (
                                                <PositionBadge position={positionValue} />
                                            ) : (
                                                value?.toString()
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
    );
};

export default PlayerTable;

const ColumnHeader: React.FC<{name: ColumnName, onClick: () => void}> = ({ name, onClick }) => {
    if (typeof name === 'string') {
        return <span >{name}</span>;
    }
    const withTooltip = (nm: String) => {
        const inner = (
            <div onClick={onClick}
                className='cursor-pointer'>
                {nm}
            </div>
        );
        if (name.tooltip) {
            return <Tooltip text={name.tooltip}>
                {inner}
            </Tooltip>
        }
        return inner;
    };
    return [<span key={`short ${name.shortName}`} className='inline md:hidden'>{withTooltip(name.shortName ?? name.name)}</span>,
        <span key={name.name} className='hidden md:inline'>{withTooltip(name.name)}</span>];
}