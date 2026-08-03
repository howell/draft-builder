/**
 * Manual pick entry: search a player, prefill the price with the inflation
 * prediction, override it, and add the pick — alone or on top of a randomized
 * state — with Undo restoring the board. This is the "what if the first stars
 * go $20 over?" workflow.
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
// DraftSimulator persists calibrated knobs; these suites render without a QueryClientProvider.
jest.mock('@/hooks/queries/useLeagueModelKnobs', () => ({
    useSaveLeagueModelKnobsMutation: () => ({ mutate: jest.fn() }),
}));

const mockedUseSimulatorData = useSimulatorData as jest.MockedFunction<typeof useSimulatorData>;

const ROSTER_NEEDS = { QB: 1, RB: 2, WR: 2 };

function makeData(): SimulatorData {
    const positions = ['QB', 'RB', 'WR'];
    const historical = [
        normalizeHistoricalDraft({
            season: '2024',
            auctionBudget: 200,
            rosterNeeds: ROSTER_NEEDS,
            picks: Array.from({ length: 24 }, (_, i) => ({
                playerId: `p${i}`,
                position: positions[i % positions.length],
                price: Math.max(1, 60 - i * 2),
                team: `t${i % 4}`,
                overallPickNumber: i + 1,
            })),
        })!,
    ];
    return {
        baseline: createPooledBaselineModels(historical),
        players: historical[0].players.map((p, i) => ({ ...p, name: `Player ${i}` })),
        rosterNeeds: ROSTER_NEEDS,
        defaultBudget: 200,
        teamCount: 4,
        historical,
        platformValueSeasons: [],
    archiveSeasons: [],
        priceMultiplier: 4 / 3,
    };
}

async function renderSimulator() {
    await act(async () => {
        render(<DraftSimulator leagueId={'espn-1' as LeagueId} googleApiKey="key" />);
    });
}

describe('DraftSimulator manual pick entry', () => {
    beforeEach(() => {
        mockedUseSimulatorData.mockReturnValue({
            data: makeData(),
            isLoading: false,
            error: null,
        });
    });

    it('adds a manual pick at an overridden price and undoes it', async () => {
        await renderSimulator();

        expect(screen.queryByTestId('simulated-picks')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'Player 3' } });
        fireEvent.click(within(screen.getByRole('listbox')).getByText('Player 3'));

        // Price prefills with the inflation model's current prediction.
        const priceInput = screen.getByLabelText('Price') as HTMLInputElement;
        expect(Number(priceInput.value)).toBeGreaterThanOrEqual(1);

        fireEvent.change(priceInput, { target: { value: '99' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add pick' }));

        const picksTable = within(screen.getByTestId('simulated-picks'));
        expect(picksTable.getByText('Player 3')).toBeInTheDocument();
        expect(picksTable.getByText('$99')).toBeInTheDocument();
        // A $99 pick for a ~$50 player is an overpay: inflation must drop.
        expect(picksTable.getByTestId('pick-delta').textContent).toMatch(/^-\d+\.\d{3}×$/);

        // The drafted player leaves the explorer and the spend tile updates.
        expect(
            within(screen.getByTestId('prediction-explorer')).queryByText('Player 3')
        ).not.toBeInTheDocument();
        expect(screen.getByText('$99 / $800')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        expect(screen.queryByTestId('simulated-picks')).not.toBeInTheDocument();
        expect(
            within(screen.getByTestId('prediction-explorer')).getByText('Player 3')
        ).toBeInTheDocument();
    });

    it('rejects picks a team cannot afford', async () => {
        await renderSimulator();

        fireEvent.change(screen.getByLabelText('Player'), { target: { value: 'Player 3' } });
        fireEvent.click(within(screen.getByRole('listbox')).getByText('Player 3'));
        fireEvent.change(screen.getByLabelText('Price'), { target: { value: '500' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add pick' }));

        expect(screen.getByText(/only has \$200 left/)).toBeInTheDocument();
        expect(screen.queryByTestId('simulated-picks')).not.toBeInTheDocument();
    });

    it('stacks manual picks on top of a randomized state', async () => {
        await renderSimulator();

        fireEvent.change(screen.getByLabelText('Stop at pick'), { target: { value: '5' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Randomize to plausible state' }));
        });
        expect(within(screen.getByTestId('simulated-picks')).getAllByRole('row')).toHaveLength(6); // header + 5

        // Draft the best remaining player from the explorer at the prefilled
        // price, assigning a team that still has its full budget (the
        // round-robin default may not afford a star mid-draft).
        const explorer = screen.getByTestId('prediction-explorer');
        const name = within(explorer).getAllByText(/^Player \d+$/)[0].textContent!;
        fireEvent.change(screen.getByLabelText('Player'), { target: { value: name } });
        fireEvent.click(within(screen.getByRole('listbox')).getByText(name));
        fireEvent.change(screen.getByTestId('entry-team'), { target: { value: 'team-4' } });
        fireEvent.click(screen.getByRole('button', { name: 'Add pick' }));

        const rows = within(screen.getByTestId('simulated-picks')).getAllByRole('row');
        expect(rows).toHaveLength(7); // header + 6
        expect(within(rows[6]).getByText(name)).toBeInTheDocument();
        expect(within(rows[6]).getByText('Team 4')).toBeInTheDocument();
    });
});
