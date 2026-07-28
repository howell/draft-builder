/**
 * Season-toggle behavior for the live-draft simulator: the checkboxes filter
 * which historical drafts feed the models, the backtest runs over only the
 * selected seasons, stale results clear on toggle, and the last remaining
 * season cannot be deselected.
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

// DraftSimulator persists calibrated knobs; this suite renders without a
// QueryClientProvider and also asserts on the persisted payload.
const mockSaveKnobs = jest.fn();
jest.mock('@/hooks/queries/useLeagueModelKnobs', () => ({
    useSaveLeagueModelKnobsMutation: () => ({ mutate: mockSaveKnobs }),
}));

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
    const historical = [syntheticDraft('2023'), syntheticDraft('2024')];
    return {
        baseline: createPooledBaselineModels(historical),
        players: historical[1].players,
        rosterNeeds: ROSTER_NEEDS,
        defaultBudget: 200,
        teamCount: 4,
        historical,
        platformValueSeasons: [],
        priceMultiplier: 4 / 3,
    };
}

async function renderSimulator() {
    await act(async () => {
        render(<DraftSimulator leagueId={'espn-1' as LeagueId} googleApiKey="key" />);
    });
}

describe('DraftSimulator season toggles', () => {
    beforeEach(() => {
        mockSaveKnobs.mockClear();
        mockedUseSimulatorData.mockReturnValue({
            data: makeData(),
            isLoading: false,
            error: null,
        });
    });

    it('persists the calibrated knobs and config for game day', async () => {
        await renderSimulator();

        fireEvent.click(screen.getByRole('button', { name: 'Calibrate model' }));
        expect(await screen.findByText(/Best elasticity/)).toBeInTheDocument();

        expect(mockSaveKnobs).toHaveBeenCalledWith({
            leagueId: 'espn-1',
            knobs: expect.objectContaining({
                elasticity: expect.any(Number),
                blend: expect.any(Number),
                calibratedAt: expect.any(String),
                seasons: ['2023', '2024'],
                config: {
                    positionalValues: false,
                    usePriors: false,
                    useExpectedUnspent: false,
                },
            }),
        });
    });

    it('renders a checked toggle per season and counts them in the header', async () => {
        await renderSimulator();

        const toggles = within(screen.getByTestId('season-toggles'));
        expect(toggles.getByLabelText('2023')).toBeChecked();
        expect(toggles.getByLabelText('2024')).toBeChecked();
        expect(screen.getByText(/history: 2 of 2 seasons/)).toBeInTheDocument();
    });

    it('backtests over only the selected seasons and clears stale results on toggle', async () => {
        await renderSimulator();

        fireEvent.click(screen.getByRole('button', { name: 'Run backtest' }));
        expect(await screen.findByText('held-out · 2 drafts')).toBeInTheDocument();
        expect(screen.getByText('Early MAE')).toBeInTheDocument();
        expect(screen.getByText('Mid MAE')).toBeInTheDocument();
        expect(screen.getByText('Late MAE')).toBeInTheDocument();

        const toggles = within(screen.getByTestId('season-toggles'));
        await act(async () => {
            fireEvent.click(toggles.getByLabelText('2023'));
        });

        // The previous report was computed from a different season set.
        expect(screen.queryByText('held-out · 2 drafts')).not.toBeInTheDocument();
        expect(screen.getByText(/history: 1 of 2 seasons/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Run backtest' }));
        expect(await screen.findByText('in-sample · 1 draft')).toBeInTheDocument();
    });

    it('prevents deselecting the last remaining season', async () => {
        await renderSimulator();

        const toggles = within(screen.getByTestId('season-toggles'));
        await act(async () => {
            fireEvent.click(toggles.getByLabelText('2023'));
        });

        expect(toggles.getByLabelText('2023')).not.toBeChecked();
        expect(toggles.getByLabelText('2024')).toBeDisabled();

        // Re-including a season re-enables the other toggle.
        await act(async () => {
            fireEvent.click(toggles.getByLabelText('2023'));
        });
        expect(toggles.getByLabelText('2024')).toBeEnabled();
    });
});
