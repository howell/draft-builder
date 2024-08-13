'use client'
import React, { useState } from 'react';

type PlayerData<T extends object> = { id: any; } & T;

export interface PlayerTableProps<T extends object> {
    players: PlayerData<T>[];
    columns: [(keyof T), string][];
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
        <div className="mx-auto my-5 border-collapse w-auto max-h-[90dvh] overflow-y-auto overflow-x-hidden">
            <table className="table-auto">
                <thead>
                    <tr>
                        {columns.map(([column, name]) => (
                            <th
                                key={column.toString()}
                                className={`mx-2 px-4 border-2 border-black bg-gray-300 p-2 text-left text-black cursor-pointer sticky top-0`}
                                onClick={() => handleSort(column)}>
                                <div className="flex justify-start items-center">
                                    <span>{name}</span>
                                    <span className="ml-2">
                                        {getSortClass(column) === 'after:content-["▲"]' ? '▲' : getSortClass(column) === 'after:content-["▼"]' ? '▼' : ''}
                                    </span>
                                </div>
                            </th>))}
                    </tr>
                </thead>
                <tbody>
                    {sortedData.map((item) => (
                        <tr key={item.id}
                            className={`even:bg-gray-300 even:text-gray-700 odd:bg-gray-700 odd:text-gray-300 ${onPlayerClick ? 'cursor-pointer' : ''}`}
                            onClick={() => onPlayerClick && onPlayerClick(item)}>
                            {columns.map(([column, _]) => (
                                <td key={`${column.toString()} ${item.id}`}
                                    className={`border-2 border-black p-2 text-left whitespace-nowrap text-ellipsis `} >
                                    <div>
                                        {(item[column] as object).toString()}
                                    </div>
                                </td>))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default PlayerTable;
