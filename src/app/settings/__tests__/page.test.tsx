/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsPage from '../page';

// Authenticated user so ProtectedRoute renders children and UserProfile shows.
jest.mock('@/lib/auth/context', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'sam@example.com', created_at: new Date().toISOString() },
    loading: false,
    signOut: jest.fn(),
  }),
}));

const mockUseLeaguesQuery = jest.fn();
jest.mock('@/hooks/queries/useLeaguesQuery', () => ({
  useLeaguesQuery: () => mockUseLeaguesQuery(),
}));

const mockUseMultipliersQuery = jest.fn();
const mockUseSaveMutation = jest.fn();
jest.mock('@/hooks/queries/useLeaguePriceMultipliers', () => ({
  useLeaguePriceMultipliersQuery: () => mockUseMultipliersQuery(),
  useSaveLeaguePriceMultiplierMutation: () => mockUseSaveMutation(),
}));

// Stub the row so the page test doesn't depend on per-league info fetching.
jest.mock('../LeagueMultiplierRow', () => ({
  __esModule: true,
  default: ({ league }: { league: { id: string } }) => (
    <div data-testid={`row-${league.id}`}>row {league.id}</div>
  ),
}));

function leaguesData(ids: string[]) {
  return {
    data: {
      leagues: {
        leagues: Object.fromEntries(ids.map((id) => [id, { platform: 'espn', id }])),
      },
    },
    isLoading: false,
  };
}

beforeEach(() => {
  mockUseMultipliersQuery.mockReturnValue({ data: {}, isLoading: false });
  mockUseSaveMutation.mockReturnValue({
    mutate: jest.fn(),
    isPending: false,
    isError: false,
    variables: undefined,
  });
});

describe('SettingsPage', () => {
  it('shows a loading state while leagues load', () => {
    mockUseLeaguesQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<SettingsPage />);
    expect(screen.getByText(/Loading leagues/)).toBeInTheDocument();
  });

  it('shows an empty state when the user has no leagues', () => {
    mockUseLeaguesQuery.mockReturnValue(leaguesData([]));
    render(<SettingsPage />);
    expect(screen.getByText(/No leagues yet/)).toBeInTheDocument();
  });

  it('renders one row per league', () => {
    mockUseLeaguesQuery.mockReturnValue(leaguesData(['lg-1', 'lg-2']));
    render(<SettingsPage />);
    expect(screen.getByTestId('row-lg-1')).toBeInTheDocument();
    expect(screen.getByTestId('row-lg-2')).toBeInTheDocument();
    expect(screen.getByText('Account Settings')).toBeInTheDocument();
  });
});
