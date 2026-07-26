/**
 * The "Randomize to plausible state" flow surfaces the generated picks:
 * a table of pick number, player, position, team, and price appears after
 * generating and disappears on Clear.
 */

import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import DraftSimulator from '../DraftSimulator';
import { useSimulatorData, SimulatorData } from '../useSimulatorData';
import {
    normalizeHistoricalDraft,
    createPooledBaselineModels,
} from '@/lib/models/live-draft/history';
import type { LeagueId } from '@/platforms/common';

jest.mock('../useSimulatorData');

const mockedUseSimulatorData = useSimulatorData as jest.MockedFunction<typeof useSimulatorData>;

const ROSTER_NEEDS = { QB: 1, RB: 2, WR: 2 };

function syntheticDraft(season: string) {
    const positions = ['QB', 'RB', 'WR'];
    const picks = Array.from({ length: 24 }, (_, i) => ({
        playerId: `${season}-p${i}`,
        position: positions[i % positions.length],
        price: Math.max(1, 60 - i * 2),
        team: `t${i % 4}`,
        overallPickNumber: i + 1,
    }));
    return normalizeHistoricalDraft({
        season,
        auctionBudget: 200,
        rosterNeeds: ROSTER_NEEDS,
        picks,
    })!;
}

function makeData(): SimulatorData {
    const historical = [syntheticDraft('2024')];
    return {
        baseline: createPooledBaselineModels(historical),
        // platformValue mimics the league-scoped API: already league-scaled.
        players: historical[0].players.map((p, i) => ({
            ...p,
            name: `Player ${i}`,
            platformValue: 40 - i,
        })),
        rosterNeeds: ROSTER_NEEDS,
        defaultBudget: 200,
        teamCount: 4,
        historical,
        platformValueSeasons: [],
        priceMultiplier: 4 / 3,
    };
}

describe('DraftSimulator simulated picks', () => {
    beforeEach(() => {
        mockedUseSimulatorData.mockReturnValue({
            data: makeData(),
            isLoading: false,
            error: null,
        });
    });

    it('shows live sticker prices unscaled — league API values are pre-multiplied', async () => {
        await act(async () => {
            render(<DraftSimulator leagueId={'espn-1' as LeagueId} googleApiKey="key" />);
        });

        const explorer = screen.getByTestId('prediction-explorer');
        const topRow = within(explorer).getAllByRole('row')[1];
        const cells = within(topRow).getAllByRole('cell');

        // rank | player | pos | Baseline | Platform (rescaled) | Platform (sticker) | Inflation
        // Player 0 has platformValue 40; scaling it again (×4/3 → $53) is the bug.
        expect(cells[5].textContent).toBe('$40');
    });

    it('lists the generated picks and clears them with the draft state', async () => {
        await act(async () => {
            render(<DraftSimulator leagueId={'espn-1' as LeagueId} googleApiKey="key" />);
        });

        expect(screen.queryByTestId('simulated-picks')).not.toBeInTheDocument();

        // The prediction explorer lists upcoming players by name (full name on
        // desktop, abbreviated on narrow screens — both are in the DOM).
        expect(screen.getByText('Player 0')).toBeInTheDocument();
        expect(screen.getByText('P. 0')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Stop at pick'), { target: { value: '5' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Randomize to plausible state' }));
        });

        const table = within(screen.getByTestId('simulated-picks'));
        const rows = table.getAllByRole('row').slice(1); // drop the header row
        expect(rows).toHaveLength(5);

        // Each row shows a named player, its team, and a dollar price.
        expect(within(rows[0]).getByText(/^Player \d+$/)).toBeInTheDocument();
        expect(within(rows[0]).getByText(/^Team \d+$/)).toBeInTheDocument();
        expect(within(rows[0]).getByText(/^\$\d+$/)).toBeInTheDocument();

        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
        });
        expect(screen.queryByTestId('simulated-picks')).not.toBeInTheDocument();
    });
});
