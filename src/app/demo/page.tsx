'use client'
import { PlatformLeague, SeasonId } from '@/platforms/common';
import React, { useEffect, useState } from 'react';
import { loadLeagues } from '../localStorage';
import Sidebar from '@/ui/Sidebar';
import MockTable, { MockTableProps } from '../league/[leagueID]/mocks/MockTable';
import { DraftAnalysis, Rankings, } from '../savedMockTypes';


export default function Demo() {
  const [availableLeagues, setAvailableLeagues] = useState<PlatformLeague[]>([]);

  useEffect(() => {
    const availableLeagues = loadLeagues();
    console.log(availableLeagues);
    setAvailableLeagues(Object.values(availableLeagues.leagues));
    console.log("Demo", demoTableProps.players);
  }, []);

  return (
        <div className='flex flex-col md:flex-row'>
            {availableLeagues.length > 0 && <Sidebar availableLeagues={availableLeagues} />}
            <main className="flex-1 p-4">
                <MockTable {...demoTableProps} />
            </main>
        </div>
    );
}

const demoRoster = Object.fromEntries([['QB', 1], ['RB', 2], ['WR', 2], ['TE', 1], ['FLEX', 1]]);
const demoPlayerPositions = ['QB', 'RB', 'WR', 'TE'];

const analysis23: DraftAnalysis = {overall: [67.45, -0.03], positions: new Map([['QB', [48.61, -0.1]], ['RB', [76.17, -0.08]], ['WR', [52.79, -0.07]], ['TE', [34.83, -0.32]]])};
const analysis22: DraftAnalysis = {overall: [80.97, -0.03], positions: new Map([['QB', [65.39, -0.11]], ['RB', [90.86, -0.08]], ['WR', [72.18, -0.08]], ['TE', [46.31, -0.35]]])};

const demoDraftHistory: Map<SeasonId, DraftAnalysis> = new Map([
    ['2023', analysis23],
    ['2022', analysis22]
    ]);

export type DemoPlayer = {
    id: string;
    name: string;
    defaultPosition: string;
    positions: string[];
    suggestedCost: number;
}

const includedPlayers: DemoPlayer[] = [
    {id: '1', name: 'Brett Favre', defaultPosition: 'QB', positions: ['QB'], suggestedCost: 10 },
    {id: '2', name: 'Marshall Faulk', defaultPosition: 'RB', positions: ['RB', 'FLEX'], suggestedCost: 34 },
    {id: '3', name: 'Randy Moss', defaultPosition: 'WR', positions: ['WR', 'FLEX'], suggestedCost: 28 },
    {id: '4', name: 'Rob Gronkowski', defaultPosition: 'TE', positions: ['TE', 'FLEX'], suggestedCost: 17 },
    {id: '5', name: 'Daunte Culpepper', defaultPosition: 'QB', positions: ['QB'], suggestedCost: 29 },
    {id: '6', name: 'Shaun Alexander', defaultPosition: 'RB', positions: ['RB', 'FLEX'], suggestedCost: 36 },
    {id: '7', name: 'Marvin Harrison', defaultPosition: 'WR', positions: ['WR', 'FLEX'], suggestedCost: 18 },
    {id: '8', name: 'Tony Gonzalez', defaultPosition: 'TE', positions: ['TE', 'FLEX'], suggestedCost: 9 },
    {id: '9', name: 'Donovan McNabb', defaultPosition: 'QB', positions: ['QB'], suggestedCost: 15 },
    {id: '10', name: 'LaDanian Tomlinson', defaultPosition: 'RB', positions: ['RB', 'FLEX'], suggestedCost: 22 },
    {id: '11', name: 'Terell Owens', defaultPosition: 'WR', positions: ['WR', 'FLEX'], suggestedCost: 10 },
    {id: '12', name: 'Shannon Sharpe', defaultPosition: 'TE', positions: ['TE', 'FLEX'], suggestedCost: 7 },
    {id: '13', name: 'Dan Merino', defaultPosition: 'QB', positions: ['QB'], suggestedCost: 4 },
    {id: '14', name: 'Barry Sanders', defaultPosition: 'RB', positions: ['RB', 'FLEX'], suggestedCost: 39 },
    {id: '15', name: 'Torry Holt', defaultPosition: 'WR', positions: ['WR', 'FLEX'], suggestedCost: 16 },
    {id: '16', name: 'Travis Kelce', defaultPosition: 'TE', positions: ['TE', 'FLEX'], suggestedCost: 13 },
    {id: '17', name: 'Lamar Jackson', defaultPosition: 'QB', positions: ['QB'], suggestedCost: 11 },
    {id: '18', name: 'Priest Holmes', defaultPosition: 'RB', positions: ['RB', 'FLEX'], suggestedCost: 33 },
    {id: '19', name: 'Jimmy Smith', defaultPosition: 'WR', positions: ['WR', 'FLEX'], suggestedCost: 9 },
    {id: '20', name: 'Kyle Pitts', defaultPosition: 'TE', positions: ['TE', 'FLEX'], suggestedCost: 15 },
];

includedPlayers.sort((a, b) => b.suggestedCost - a.suggestedCost);

const positionOrder = new Map<string, DemoPlayer[]>();
for (const player of includedPlayers) {
    const position = player.defaultPosition
    if (!positionOrder.has(position)) {
        const positionData = includedPlayers.filter(p => p.defaultPosition === position);
        positionOrder.set(position, positionData);
    }
}

const demoRanks: Rankings = {
    platform: 'demo' as unknown as 'sleeper',
    overall: new Map(includedPlayers.map((player, index) => [player.id, index])),
    positional: new Map([...positionOrder.entries()].map(([position, players]) => [position, new Map(players.map((player, index) => [player.id, index]))]))
};

const demoPlayers = includedPlayers.map(player => ({
    ...player,
    overallRank: 1 + includedPlayers.indexOf(player),
    positionRank: 1 + positionOrder.get(player.defaultPosition)!.indexOf(player)
}));


const demoTableProps: MockTableProps = {
    leagueId: '42',
    auctionBudget: 100,
    positions: demoRoster,
    players: demoPlayers,
    draftHistory: demoDraftHistory,
    playerPositions: demoPlayerPositions,
    availableRankings: [{name: "Ranks", shortName: "Ranks", value: demoRanks}]
};
