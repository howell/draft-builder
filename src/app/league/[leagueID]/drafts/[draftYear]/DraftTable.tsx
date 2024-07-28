'use client'
import React, { useState } from 'react';
import './DraftTable.css';

export type TableData = {
    name: string;
    auctionPrice: number;
    numberDrafted: number;
    teamDrafted: string;
    position: string;
};

type SortColumn = keyof TableData;

interface DraftTableProps {
    picks: TableData[];
}

const DraftTable: React.FC<DraftTableProps> = ({picks}) => {
    const [data, setData] = useState<TableData[]>(picks);
    const [sortColumn, setSortColumn] = useState<SortColumn>('auctionPrice');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

    const handleSort = (column: SortColumn) => {
        console.log('Sorting by', column);
        if (column === sortColumn) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const sortedData = [...data].sort((a, b) => {
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
        <table className="table-container">
            <thead>
                <tr>
                    <th className={getSortClass('auctionPrice')} onClick={() => handleSort('auctionPrice')}>
                        <div className="small-column">Price</div>
                    </th>
                    <th className={getSortClass('numberDrafted')} onClick={() => handleSort('numberDrafted')}>
                        <div className="small-column">Nominated</div>
                    </th>
                    <th className={getSortClass('teamDrafted')} onClick={() => handleSort('teamDrafted')}>Drafted By</th>
                    <th className={getSortClass('name')} onClick={() => handleSort('name')}>Name</th>
                    <th className={getSortClass('position')} onClick={() => handleSort('position')}>
                        <div className="small-column">Position</div>
                        </th>
                </tr>
            </thead>
            <tbody>
                {sortedData.map((item) => (
                    <tr key={item.name}>
                        <td><div className="small-column">{item.auctionPrice}</div></td>
                        <td><div className="small-column">{item.numberDrafted}</div></td>
                        <td>{item.teamDrafted}</td>
                        <td>{item.name}</td>
                        <td><div className="small-column">{item.position}</div></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
};

export default DraftTable;