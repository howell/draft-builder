/**
 * Bid-history browsing tests: the search box, position/team/outcome filters,
 * and metric sorts over archived lots, plus the INIT catch-up summary and
 * the no-match empty state.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BidHistory from '../archives/[archiveId]/BidHistory';
import type { ArchivedBid, ArchivedPick } from '@/lib/live-draft/archive';

const bid = (
    playerId: number,
    seq: number,
    teamId: number,
    overrides: Partial<ArchivedBid> = {}
): ArchivedBid => ({
    playerId,
    seq,
    kind: seq === 0 ? 'open' : 'bid',
    teamId,
    amount: seq + 1,
    atMs: 1_000_000 + seq * 5_000,
    ...overrides,
});

const pick = (
    playerId: number,
    pickNumber: number,
    overrides: Partial<ArchivedPick> = {}
): ArchivedPick => ({
    pickNumber,
    teamId: 2,
    playerId,
    playerName: `Player ${playerId}`,
    position: 'RB',
    price: 20,
    nominatingTeamId: 1,
    observedBidCount: 2,
    distinctBidders: 2,
    soldAtMs: 1_030_000,
    ...overrides,
});

// Three observed lots (two sold, one unsold) plus one INIT-only pick.
const picks: ArchivedPick[] = [
    pick(101, 1, { playerName: 'Caleb Williams', position: 'QB', price: 47, teamId: 2 }),
    pick(202, 2, { playerName: 'Jahmyr Gibbs', position: 'RB', price: 81, teamId: 5 }),
    pick(303, 3, { playerName: 'Ghost Pick', position: 'WR' }), // no observed bidding
];
const bids: ArchivedBid[] = [
    bid(101, 0, 1),
    bid(101, 1, 2, { amount: 47 }),
    bid(202, 0, 5),
    bid(202, 1, 3),
    bid(202, 2, 4, { kind: 'pass', amount: null }),
    bid(202, 3, 5, { amount: 81 }),
    bid(404, 0, 7), // unsold nomination
];

const renderHistory = () =>
    render(
        <BidHistory
            bids={bids}
            picks={picks}
            teamLabel={teamId => `Team ${teamId}`}
            resolvePlayer={playerId =>
                playerId === 404 ? { name: 'Sleeper Guy', position: 'WR' } : undefined
            }
        />
    );

const lotNames = () =>
    screen.getAllByTestId('bid-lot').map(el => el.querySelector('.font-medium')?.textContent);

describe('BidHistory', () => {
    it('shows all lots in draft order with the INIT catch-up summary', () => {
        renderHistory();
        expect(lotNames()).toEqual(['Caleb Williams', 'Jahmyr Gibbs', 'Sleeper Guy']);
        expect(screen.getByText(/3 lots · 7 events/)).toBeInTheDocument();
        expect(screen.getByText(/1 pick without observed bidding/)).toBeInTheDocument();
    });

    it('searches by player name, counting the visible subset', () => {
        renderHistory();
        fireEvent.change(screen.getByTestId('bid-history-search'), {
            target: { value: 'gibbs' },
        });
        expect(lotNames()).toEqual(['Jahmyr Gibbs']);
        expect(screen.getByText(/showing 1 of 3/)).toBeInTheDocument();
    });

    it('shows an empty state when nothing matches', () => {
        renderHistory();
        fireEvent.change(screen.getByTestId('bid-history-search'), {
            target: { value: 'nobody' },
        });
        expect(screen.queryAllByTestId('bid-lot')).toHaveLength(0);
        expect(screen.getByText('No lots match the current filters.')).toBeInTheDocument();
    });

    it('filters by position, including fallback-resolved unsold lots', () => {
        renderHistory();
        fireEvent.change(screen.getByTestId('bid-history-position'), {
            target: { value: 'WR' },
        });
        expect(lotNames()).toEqual(['Sleeper Guy']);
    });

    it('filters by bidding team and omits pass-only teams from the options', () => {
        renderHistory();
        const teamSelect = screen.getByTestId('bid-history-team');
        const optionValues = Array.from(teamSelect.querySelectorAll('option')).map(o => o.value);
        expect(optionValues).toContain('3');
        expect(optionValues).not.toContain('4'); // team 4 only passed

        fireEvent.change(teamSelect, { target: { value: '3' } });
        expect(lotNames()).toEqual(['Jahmyr Gibbs']);
    });

    it('filters by outcome', () => {
        renderHistory();
        fireEvent.change(screen.getByTestId('bid-history-outcome'), {
            target: { value: 'unsold' },
        });
        expect(lotNames()).toEqual(['Sleeper Guy']);
    });

    it('sorts by price with unsold lots last', () => {
        renderHistory();
        fireEvent.change(screen.getByTestId('bid-history-sort'), {
            target: { value: 'price' },
        });
        expect(lotNames()).toEqual(['Jahmyr Gibbs', 'Caleb Williams', 'Sleeper Guy']);
    });

    it('renders nothing when no bidding was observed at all', () => {
        const { container } = render(
            <BidHistory bids={[]} picks={picks} teamLabel={id => `Team ${id}`} />
        );
        expect(container).toBeEmptyDOMElement();
    });
});
