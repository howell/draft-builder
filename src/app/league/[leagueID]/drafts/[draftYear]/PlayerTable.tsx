'use client'
import React, { useState } from 'react';
import './PlayerTable.css';

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
            return sortDirection === 'asc' ? 'sort-asc' : 'sort-desc';
        }
        return '';
    };

    return (
        <div className="table-container">
        <table >
            <thead>
                <tr>
                    {columns.map(([column, name]) => (
                        <th key={column.toString()} className={getSortClass(column)} onClick={() => handleSort(column)}>{name}</th>))}
                </tr>
            </thead>
            <tbody>
                {sortedData.map((item) => (
                    <tr key={item.id}
                        className={onPlayerClick ? 'clickable' : ''}
                        onClick={() => onPlayerClick && onPlayerClick(item)}>
                        {columns.map(([column, _]) => (
                            <td key={`${column.toString()} ${item.id}`}><div >{(item[column] as object).toString()}</div></td>))}
                    </tr>
                ))}
            </tbody>
        </table>
        </div>
    );
};

export default PlayerTable;
