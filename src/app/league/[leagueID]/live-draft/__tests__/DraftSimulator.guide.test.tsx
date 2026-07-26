/**
 * The in-page help: a collapsed "How this page works" guide card, plus
 * tooltip triggers on the model columns, metrics, and knobs.
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

describe('DraftSimulator in-page help', () => {
    beforeEach(() => {
        mockedUseSimulatorData.mockReturnValue({
            data: makeData(),
            isLoading: false,
            error: null,
        });
    });

    it('shows the guide collapsed by default and expands on toggle', async () => {
        await act(async () => {
            render(<DraftSimulator leagueId={'espn-1' as LeagueId} googleApiKey="key" />);
        });

        expect(screen.getByText('How this page works')).toBeInTheDocument();
        expect(screen.queryByText('Suggested workflow')).not.toBeInTheDocument();

        fireEvent.click(screen.getByTestId('simulator-guide-toggle'));

        expect(screen.getByText('Suggested workflow')).toBeInTheDocument();
        expect(screen.getByText(/The price models/)).toBeInTheDocument();
        expect(screen.getByText(/Reading the backtest table/)).toBeInTheDocument();

        fireEvent.click(screen.getByTestId('simulator-guide-toggle'));
        expect(screen.queryByText('Suggested workflow')).not.toBeInTheDocument();
    });

    it('attaches tooltip triggers to the knobs, tiles, and explorer columns', async () => {
        await act(async () => {
            render(<DraftSimulator leagueId={'espn-1' as LeagueId} googleApiKey="key" />);
        });

        // Sliders (2) + knob checkboxes (3) + stat tiles (2) + positional
        // inflation title (1) + explorer model columns (4, regression not yet
        // trained) + train-regression button (1) at minimum.
        const triggers = screen.getAllByRole('tooltip-trigger');
        expect(triggers.length).toBeGreaterThanOrEqual(13);
        expect(screen.getByText('Platform (sticker)')).toBeInTheDocument();
        expect(screen.getByText('Platform (rescaled)')).toBeInTheDocument();
    });
});
