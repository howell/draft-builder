/**
 * Game-day board tests: frame-driven picks with real team names, the
 * on-the-clock callout with a model price, calibration badges, the
 * zero-frames empty state, and read-only-ness (no entry controls).
 */

import React from 'react';
import { render, screen, within, act } from '@testing-library/react';
import LiveDraftBoard from '../LiveDraftBoard';
import { useSimulatorData, SimulatorData } from '../useSimulatorData';
import {
    normalizeHistoricalDraft,
    createPooledBaselineModels,
} from '@/lib/models/live-draft/history';
import type { LeagueId } from '@/platforms/common';

jest.mock('../useSimulatorData');

const mockFrames = jest.fn();
jest.mock('@/hooks/queries/useLiveDraftFrames', () => ({
    useLiveDraftFramesQuery: () => mockFrames(),
}));

const mockTeams = jest.fn();
jest.mock('@/hooks/queries/useLeagueTeamsQuery', () => ({
    useLeagueTeamsQuery: () => mockTeams(),
}));

jest.mock('@/hooks/queries', () => ({
    usePlayersQuery: () => ({ data: [] }),
}));

jest.mock('@/hooks/queries/useLeagueQuery', () => ({
    useLeagueQuery: () => ({ data: undefined }),
}));

const mockKnobs = jest.fn();
jest.mock('@/hooks/queries/useLeagueModelKnobs', () => ({
    useLeagueModelKnobsQuery: () => mockKnobs(),
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
                playerId: `h${i}`,
                position: positions[i % positions.length],
                price: Math.max(1, 60 - i * 2),
                team: `t${i % 4}`,
                overallPickNumber: i + 1,
            })),
        })!,
    ];
    // A hand-built pool whose ids match the ESPN player ids in the frames.
    const players = Array.from({ length: 12 }, (_, i) => ({
        id: String(101 + i),
        name: `Player ${101 + i}`,
        defaultPosition: positions[i % positions.length],
        positionRank: Math.floor(i / positions.length),
        overallRank: i,
    }));
    return {
        baseline: createPooledBaselineModels(historical),
        players,
        rosterNeeds: ROSTER_NEEDS,
        defaultBudget: 200,
        teamCount: 4,
        historical,
        platformValueSeasons: [],
        priceMultiplier: 4 / 3,
    };
}

let frameId = 1;
function frame(seq: number, data: string) {
    return {
        id: frameId++,
        captureId: 'cap-live-0001',
        seq,
        ts: '2026-08-30T13:05:00.000Z',
        dir: 'receive' as const,
        data,
    };
}

const TEAMS = [
    { id: '1', name: 'The Ramrods' },
    { id: '2', name: 'Waiver Wire Warriors' },
    { id: '3', name: 'Team Three' },
    { id: '4', name: 'Team Four' },
];

async function renderBoard() {
    await act(async () => {
        render(<LiveDraftBoard leagueId={'espn-1' as LeagueId} googleApiKey="key" />);
    });
}

beforeEach(() => {
    frameId = 1;
    mockedUseSimulatorData.mockReturnValue({ data: makeData(), isLoading: false, error: null });
    mockTeams.mockReturnValue({ data: TEAMS });
    mockKnobs.mockReturnValue({ data: {} });
    mockFrames.mockReturnValue({ data: [] });
});

describe('LiveDraftBoard', () => {
    it('shows the waiting state before any frames arrive, with no entry controls', async () => {
        await renderBoard();

        expect(screen.getByTestId('live-empty')).toBeInTheDocument();
        expect(screen.queryByTestId('prediction-explorer')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add pick' })).not.toBeInTheDocument();
        expect(screen.queryByTestId('entry-team')).not.toBeInTheDocument();
        expect(screen.getByText(/uncalibrated — identity model/)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Calibrate in the Simulator' })).toBeInTheDocument();
    });

    it('renders frame-driven picks with real team names, newest first', async () => {
        mockFrames.mockReturnValue({
            data: [
                frame(0, 'SOLD 2 101 10 55 0'),
                frame(1, 'SOLD 1 102 11 40 0'),
            ],
        });
        await renderBoard();

        const rows = within(screen.getByTestId('simulated-picks')).getAllByRole('row');
        expect(rows).toHaveLength(3); // header + 2
        // Newest first: pick #2 on top.
        expect(within(rows[1]).getByText('Player 102')).toBeInTheDocument();
        expect(within(rows[1]).getByText('The Ramrods')).toBeInTheDocument();
        expect(within(rows[2]).getByText('Waiver Wire Warriors')).toBeInTheDocument();

        // Drafted players leave the explorer; the board stays read-only.
        expect(
            within(screen.getByTestId('prediction-explorer')).queryByText('Player 101')
        ).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Add pick' })).not.toBeInTheDocument();
    });

    it('shows the on-the-clock lot with a model price and gap', async () => {
        mockFrames.mockReturnValue({
            data: [
                frame(0, 'SOLD 2 101 10 55 0'),
                frame(1, 'BID 3 103 1 25000 24000'),
                frame(2, 'CLOCK 2 19000 3 103 5'),
            ],
        });
        await renderBoard();

        const lot = within(screen.getByTestId('current-lot'));
        expect(lot.getByText('Player 103')).toBeInTheDocument();
        expect(lot.getByText('$5')).toBeInTheDocument();
        expect(lot.getByText(/Team Three/)).toBeInTheDocument();
        expect(screen.getByTestId('lot-gap').textContent).toMatch(/model/);
    });

    it('shows the calibrated badge when knobs are stored for this league', async () => {
        mockKnobs.mockReturnValue({
            data: {
                'espn-1': {
                    elasticity: 0,
                    blend: 0.6,
                    calibratedAt: '2026-07-27T13:00:00.000Z',
                    config: {
                        positionalValues: false,
                        usePriors: false,
                        useExpectedUnspent: false,
                    },
                },
            },
        });
        mockFrames.mockReturnValue({ data: [frame(0, 'SOLD 2 101 10 55 0')] });
        await renderBoard();

        expect(screen.getByText(/e=0 · w=0\.6/)).toBeInTheDocument();
        expect(screen.queryByText(/uncalibrated/)).not.toBeInTheDocument();
    });
});
