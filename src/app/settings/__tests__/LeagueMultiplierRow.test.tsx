/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import LeagueMultiplierRow from '../LeagueMultiplierRow';
import type { LeagueInfo } from '@/platforms/PlatformApi';
import type { PlatformLeague } from '@/platforms/common';

// NOTE: the repo's jest.setup replaces `global.window` with a stub, which breaks
// React 19's input value-tracker / focus polyfill, so simulated *typing* into an
// input does not propagate (button clicks do). The save/validation rule is covered
// by the pure `parseMultiplierInput` unit tests; here we cover display + the parts
// driven by props and clicks.

const mockUseLeagueInfoQuery = jest.fn();
jest.mock('@/hooks/queries/useLeagueInfoQuery', () => ({
  useLeagueInfoQuery: (leagueId: string) => mockUseLeagueInfoQuery(leagueId),
}));

const league: PlatformLeague = { platform: 'espn', id: 'lg-1' };

// Custom-budget league → default multiplier is 4/3, rendered as "1.3333".
const customInfo: LeagueInfo = {
  name: 'My League',
  drafted: false,
  scoringType: 'ppr',
  draft: { type: 'auction', auctionBudget: 240 },
  rosterSettings: { QB: 1, RB: 2 },
};

function renderRow(props: Partial<React.ComponentProps<typeof LeagueMultiplierRow>> = {}) {
  const onSave = jest.fn();
  const onReset = jest.fn();
  render(
    <LeagueMultiplierRow
      league={league}
      stored={undefined}
      saving={false}
      onSave={onSave}
      onReset={onReset}
      {...props}
    />
  );
  return { onSave, onReset, user: userEvent.setup() };
}

beforeEach(() => {
  mockUseLeagueInfoQuery.mockReturnValue({ data: customInfo });
});

describe('LeagueMultiplierRow', () => {
  it('shows the league name, budget, and computed default (no override)', () => {
    renderRow();
    expect(screen.getByText('My League')).toBeInTheDocument();
    expect(screen.getByText(/\$240 budget/)).toBeInTheDocument();
    expect(screen.getByText(/Default: 1\.3333$/)).toBeInTheDocument();
    expect(screen.queryByText(/overridden/)).not.toBeInTheDocument();
  });

  it('marks the row as overridden and seeds the input from the stored value', () => {
    renderRow({ stored: 1.25 });
    expect(screen.getByText(/Default: 1\.3333 \(overridden\)/)).toBeInTheDocument();
    expect(screen.getByTestId('multiplier-input-lg-1')).toHaveValue(1.25);
  });

  it('falls back to the league id when info has not loaded', () => {
    mockUseLeagueInfoQuery.mockReturnValue({ data: undefined });
    renderRow();
    expect(screen.getByText('lg-1')).toBeInTheDocument();
    // No info → treated as custom → default 1.3333
    expect(screen.getByText(/Default: 1\.3333$/)).toBeInTheDocument();
  });

  it('disables Save initially (input equals the effective value)', () => {
    renderRow({ stored: 1.25 });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('disables Reset when there is no override', () => {
    renderRow({ stored: undefined });
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  });

  it('calls onReset when an override is present', async () => {
    const { onReset, user } = renderRow({ stored: 1.25 });
    const reset = screen.getByRole('button', { name: 'Reset' });
    expect(reset).toBeEnabled();
    await user.click(reset);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('disables both controls while saving', () => {
    renderRow({ stored: 1.25, saving: true });
    expect(screen.getByTestId('multiplier-input-lg-1')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled();
  });
});
