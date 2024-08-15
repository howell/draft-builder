'use client'
import Tooltip from '@/ui/Tooltip';
import React, { useState } from 'react';

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
        <div className="mx-auto my-5 border-collapse w-auto max-h-[90dvh] overflow-y-auto overflow-x-auto md:overflow-x-hidden">
            <table className="table-auto w-full">
                <thead>
                    <tr>
                        {columns.map(([column, name]) => (
                            <th
                                key={column.toString()}
                                className={`max-w-fit md:w-min md:max-w-fit mx-2 px-2 py-2 
                                            sticky top-0
                                            border-2 border-black
                                            text-left cursor-pointer 
                                             bg-gray-300 text-black
                                             ${getSortClass(column)}`}
                                onClick={() => handleSort(column)}>
                                <div className="flex justify-start items-center">
                                    <ColumnHeader name={name} />
                                </div>
                            </th>))}
                    </tr>
                </thead>
                <tbody>
                    {sortedData.map((item) => (
                        <tr key={item.id}
                            className={`even:bg-gray-300 even:text-black odd:bg-gray-700 odd:text-white ${onPlayerClick ? 'cursor-pointer' : ''}`}
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

const ColumnHeader: React.FC<{name: ColumnName}> = ({ name }) => {
    if (typeof name === 'string') {
        return <span >{name}</span>;
    }
    const withTooltip = (nm: String) => name.tooltip ? <Tooltip content={name.tooltip}>{nm}</Tooltip> : nm;
    return [<span key={name.shortName} className='inline md:hidden'>{withTooltip(name.shortName ?? name.name)}</span>,
        <span key={name.name} className='hidden md:inline'>{withTooltip(name.name)}</span>];
}