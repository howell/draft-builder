/**
 * Game-day board tests: frame-driven picks with real team names, the
 * on-the-clock callout with a model price, calibration badges, the
 * zero-frames empty state, and read-only-ness (no entry controls).
 */

import React from 'react';
import { render, screen, within, act, fireEvent } from '@testing-library/react';
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

const idleMutation = () => ({ mutate: jest.fn(), isPending: false, isError: false, error: null });
jest.mock('@/hooks/queries/useLiveDraftArchives', () => ({
    useLiveDraftArchivesQuery: () => ({ data: [] }),
    useArchiveLiveDraftMutation: () => idleMutation(),
    useClearLiveDraftFramesMutation: () => idleMutation(),
}));

jest.mock('@/hooks/queries/usePlayerValuesQuery', () => ({
    usePlayerValuesQuery: () => ({ data: undefined }),
}));

const mockPlans = jest.fn();
const mockSavePlan = jest.fn();
jest.mock('@/hooks/queries/useLeagueRosterPlans', () => ({
    useLeagueRosterPlansQuery: () => mockPlans(),
    useSaveLeagueRosterPlanMutation: () => ({
        mutate: mockSavePlan,
        isPending: false,
        isError: false,
        error: null,
    }),
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
        positions: [positions[i % positions.length], 'Bench'],
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
    archiveSeasons: [],
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
    mockPlans.mockReturnValue({ data: {}, isLoading: false });
    mockSavePlan.mockReset();
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

    it('detects my team from TOKEN and locks my picks at their real prices', async () => {
        mockFrames.mockReturnValue({
            data: [
                frame(0, 'TOKEN 1:12345:2:{SWID}:x'),
                frame(1, 'SOLD 2 101 10 55 0'),
                frame(2, 'SOLD 1 102 11 40 0'),
            ],
        });
        await renderBoard();

        const planner = within(screen.getByTestId('my-roster-planner'));
        // Auto option names the detected team (team 2 = Waiver Wire Warriors).
        expect(planner.getByRole('option', { name: /Auto — Waiver Wire Warriors/ })).toBeInTheDocument();
        // My pick (Player 101, $55) is locked; team 1's pick is not mine.
        const locked = planner.getByTestId('locked-roster-QB-0');
        expect(within(locked).getByText('Player 101')).toBeInTheDocument();
        expect(within(locked).getByText('$55')).toBeInTheDocument();
        expect(planner.getByTestId('plan-locked')).toHaveTextContent('Locked $55');
        expect(planner.queryByText('Player 102')).not.toBeInTheDocument();
    });

    it('prompts for a team without TOKEN and persists a manual choice', async () => {
        jest.useFakeTimers();
        try {
            mockFrames.mockReturnValue({ data: [frame(0, 'SOLD 2 101 10 55 0')] });
            await renderBoard();

            const planner = within(screen.getByTestId('my-roster-planner'));
            expect(planner.getByRole('option', { name: 'Select your team…' })).toBeInTheDocument();
            expect(planner.getByText(/Waiting for the draft room/)).toBeInTheDocument();

            const select = planner.getByTestId('my-roster-team-select');
            await act(async () => {
                fireEvent.change(select, { target: { value: '1' } });
            });
            expect(planner.getByTestId('my-roster-table')).toBeInTheDocument();

            await act(async () => {
                jest.advanceTimersByTime(600);
            });
            expect(mockSavePlan).toHaveBeenCalledWith(
                expect.objectContaining({ plan: expect.objectContaining({ teamId: '1' }) })
            );
        } finally {
            jest.useRealTimers();
        }
    });

    it('flags a planned player drafted by another team and excludes them from planned spend', async () => {
        mockPlans.mockReturnValue({
            data: {
                'espn-1': {
                    selections: {
                        'QB#0': { playerId: '103', delta: 2 },  // sniped below
                        'RB#0': { playerId: '105', delta: 0 },  // stays planned
                    },
                },
            },
            isLoading: false,
        });
        mockFrames.mockReturnValue({
            data: [
                frame(0, 'TOKEN 1:12345:2:{SWID}:x'),
                frame(1, 'SOLD 4 103 10 33 0'), // team 4 takes my planned QB
            ],
        });
        await renderBoard();

        const planner = within(screen.getByTestId('my-roster-planner'));
        const sniped = planner.getByTestId('sniped-roster-QB-0');
        expect(within(sniped).getByText('Player 103')).toBeInTheDocument();
        expect(within(sniped).getByText(/gone to Team Four for \$33/)).toBeInTheDocument();
        // Planned spend counts only the surviving RB plan.
        const rbPrice = planner.getByTestId('plan-planned').textContent;
        expect(rbPrice).not.toContain('$0');
    });

    it('shows model-at-pick prices with paid deltas and filters picks by position', async () => {
        mockFrames.mockReturnValue({
            data: [
                frame(0, 'SOLD 2 101 10 55 0'), // QB
                frame(1, 'SOLD 1 102 11 40 0'), // RB
            ],
        });
        await renderBoard();

        const picksTable = within(screen.getByTestId('simulated-picks'));
        // Every pick row carries a model price and a signed paid−model delta.
        const models = picksTable.getAllByTestId('pick-model');
        const deltas = picksTable.getAllByTestId('pick-paid-delta');
        expect(models).toHaveLength(2);
        expect(deltas).toHaveLength(2);
        expect(models[0].textContent).toMatch(/^\$\d+$/);
        expect(deltas[0].textContent).toMatch(/^[+−]\$\d+$|^\$0$/);

        // The trend line summarizes the unfiltered set.
        expect(screen.getByTestId('picks-trend')).toHaveTextContent('2 picks · $95 spent');
        expect(screen.getByTestId('picks-trend')).toHaveTextContent(/vs model/);

        // Filter to RB: only the RB pick remains, trend follows.
        await act(async () => {
            fireEvent.click(
                within(screen.getByTestId('picks-position-filter')).getByRole('button', { name: 'RB' })
            );
        });
        const rows = within(screen.getByTestId('simulated-picks')).getAllByRole('row');
        expect(rows).toHaveLength(2); // header + RB pick
        expect(within(rows[1]).getByText('Player 102')).toBeInTheDocument();
        expect(screen.getByTestId('picks-trend')).toHaveTextContent('1 pick · $40 spent');
    });

    it('collapses empty bench slots into one expandable row', async () => {
        const data = makeData();
        mockedUseSimulatorData.mockReturnValue({
            data: { ...data, rosterNeeds: { ...data.rosterNeeds, Bench: 3 } },
            isLoading: false,
            error: null,
        });
        mockFrames.mockReturnValue({
            data: [frame(0, 'TOKEN 1:12345:2:{SWID}:x'), frame(1, 'SOLD 2 101 10 55 0')],
        });
        await renderBoard();

        const planner = within(screen.getByTestId('my-roster-planner'));
        const collapsed = planner.getByTestId('bench-collapsed');
        expect(collapsed).toHaveTextContent('3 open slots · $3 reserved');
        expect(planner.queryByTestId('roster-player-input-Bench-0')).not.toBeInTheDocument();

        await act(async () => {
            fireEvent.click(within(collapsed).getByRole('button', { name: 'plan bench…' }));
        });
        expect(planner.getByTestId('roster-player-input-Bench-0')).toBeInTheDocument();
        expect(planner.getByTestId('roster-player-input-Bench-2')).toBeInTheDocument();
        expect(planner.queryByTestId('bench-collapsed')).not.toBeInTheDocument();
    });

    it('filters the best-available list by name query', async () => {
        mockFrames.mockReturnValue({ data: [frame(0, 'SOLD 2 101 10 55 0')] });
        await renderBoard();

        const explorer = () => within(screen.getByTestId('prediction-explorer'));
        expect(explorer().getByTitle('Player 103')).toBeInTheDocument();
        expect(explorer().getByTitle('Player 104')).toBeInTheDocument();

        await act(async () => {
            fireEvent.change(screen.getByTestId('explorer-name-search'), {
                target: { value: 'Player 103' },
            });
        });
        expect(explorer().getByTitle('Player 103')).toBeInTheDocument();
        expect(explorer().queryByTitle('Player 104')).not.toBeInTheDocument();
    });

    it('filters the best-available list by position', async () => {
        mockFrames.mockReturnValue({ data: [frame(0, 'SOLD 2 101 10 55 0')] });
        await renderBoard();

        // Open the Filters collapsible and uncheck WR.
        await act(async () => {
            screen.getByTestId('explorer-filters').click();
        });
        const wrToggle = within(screen.getByTestId('explorer-filters-body')).getByLabelText('WR');
        await act(async () => {
            fireEvent.click(wrToggle);
        });

        const explorer = within(screen.getByTestId('prediction-explorer'));
        expect(explorer.queryByTitle('Player 103')).not.toBeInTheDocument(); // WR
        expect(explorer.getByTitle('Player 104')).toBeInTheDocument(); // QB
    });

    it('adds a clicked explorer player to the roster plan at the model price', async () => {
        mockFrames.mockReturnValue({
            data: [
                frame(0, 'TOKEN 1:12345:2:{SWID}:x'),
                frame(1, 'SOLD 2 101 10 55 0'),
            ],
        });
        await renderBoard();

        const planner = within(screen.getByTestId('my-roster-planner'));
        expect(planner.getByTestId('plan-planned')).toHaveTextContent('Planned $0');
        expect(screen.getByText(/Click a player to add them/)).toBeInTheDocument();

        // Player 102 is an RB; clicking should land them on the open RB slot.
        await act(async () => {
            fireEvent.click(
                within(screen.getByTestId('prediction-explorer')).getByTitle('Player 102')
            );
        });

        expect(planner.getByTestId('roster-player-input-RB-0')).toHaveValue('Player 102');
        expect(planner.getByTestId('plan-planned')).not.toHaveTextContent('Planned $0');
        // The clicked player leaves the available list (now planned).
        expect(
            within(screen.getByTestId('prediction-explorer')).queryByTitle('Player 102')
        ).not.toBeInTheDocument();
    });

    it('offers archive and clear-buffer actions only once frames exist', async () => {
        await renderBoard();
        expect(screen.queryByRole('button', { name: 'Archive draft…' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Clear buffer' })).not.toBeInTheDocument();
    });

    it('opens the archive panel from the board actions', async () => {
        mockFrames.mockReturnValue({ data: [frame(0, 'SOLD 2 101 10 55 0')] });
        await renderBoard();

        expect(screen.getByRole('button', { name: 'Clear buffer' })).toBeInTheDocument();
        await act(async () => {
            screen.getByRole('button', { name: 'Archive draft…' }).click();
        });
        expect(screen.getByText('Archive this draft')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Archive & clear buffer' })).toBeInTheDocument();
        // 1 frame, 1 pick parsed out of it.
        expect(screen.getByText(/1 frames · 1 capture · 1 picks/)).toBeInTheDocument();
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
