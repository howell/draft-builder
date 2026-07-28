/**
 * Regression training is opt-in: no Regression column exists until "Train
 * regression" is pressed, the button reports progress and the trained R²,
 * and changing the league config discards the trained model.
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
        players: historical[0].players,
        rosterNeeds: ROSTER_NEEDS,
        defaultBudget: 200,
        teamCount: 4,
        historical,
        platformValueSeasons: [],
        priceMultiplier: 4 / 3,
    };
}

describe('DraftSimulator regression opt-in', () => {
    beforeEach(() => {
        mockedUseSimulatorData.mockReturnValue({
            data: makeData(),
            isLoading: false,
            error: null,
        });
    });

    it('adds the Regression column only after training, and drops it on config change', async () => {
        await act(async () => {
            render(<DraftSimulator leagueId={'espn-1' as LeagueId} googleApiKey="key" />);
        });

        // Untrained: no Regression column anywhere.
        expect(screen.queryByText('Regression')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Train regression' }));

        // Training is deferred so the busy state can paint; wait for the result.
        expect(await screen.findByText('Regression')).toBeInTheDocument();
        expect(screen.getByTestId('regression-status').textContent).toMatch(/R² -?\d/);
        expect(
            screen.queryByRole('button', { name: 'Train regression' })
        ).not.toBeInTheDocument();

        // Changing the league config invalidates the trained model.
        fireEvent.change(screen.getByLabelText('Budget / team'), { target: { value: '240' } });
        expect(screen.queryByText('Regression')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Train regression' })).toBeInTheDocument();
    });
});
