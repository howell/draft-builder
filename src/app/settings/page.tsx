'use client';

import Link from 'next/link';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import UserProfile from '@/components/auth/UserProfile';
import { Card, CardBody, CardHeader, CardTitle } from '@/ui/Card';
import { useLeaguesQuery } from '@/hooks/queries/useLeaguesQuery';
import {
  useLeaguePriceMultipliersQuery,
  useSaveLeaguePriceMultiplierMutation,
} from '@/hooks/queries/useLeaguePriceMultipliers';
import type { LeagueId, PlatformLeague } from '@/platforms/common';
import LeagueMultiplierRow from './LeagueMultiplierRow';

export default function SettingsPage() {
  const leaguesQuery = useLeaguesQuery();
  const multipliersQuery = useLeaguePriceMultipliersQuery();
  const saveMutation = useSaveLeaguePriceMultiplierMutation();

  const leagues: PlatformLeague[] = leaguesQuery.data?.leagues.leagues
    ? Object.values(leaguesQuery.data.leagues.leagues)
    : [];
  const multipliers = multipliersQuery.data ?? {};

  // Disable controls for the league currently being saved.
  const savingLeagueId =
    saveMutation.isPending ? (saveMutation.variables?.leagueId as LeagueId | undefined) : undefined;

  return (
    <ProtectedRoute>
      <main className="flex min-h-screen flex-col items-center pt-16 px-4 pb-16 bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col w-full max-w-2xl gap-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Account Settings</h1>
            <Link href="/" className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400">
              ← Home
            </Link>
          </div>

          <UserProfile showEmail={true} />

          <Card>
            <CardHeader>
              <CardTitle>League price multipliers</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                ESPN scales its published auction values by a league-wide constant to produce the
                suggested prices shown in the draft room. Standard leagues default to{' '}
                <span className="font-medium">1.0</span>; leagues with custom settings default to{' '}
                <span className="font-medium">1.333</span>. Override the value here for any league.
              </p>

              {leaguesQuery.isLoading || multipliersQuery.isLoading ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4">Loading leagues…</p>
              ) : leagues.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                  No leagues yet. Add a league from the home page to configure its multiplier.
                </p>
              ) : (
                <div className="flex flex-col">
                  {leagues.map((league) => (
                    <LeagueMultiplierRow
                      key={league.id}
                      league={league}
                      stored={multipliers[league.id]}
                      saving={savingLeagueId === league.id}
                      onSave={(multiplier) => saveMutation.mutate({ leagueId: league.id, multiplier })}
                      onReset={() => saveMutation.mutate({ leagueId: league.id, multiplier: null })}
                    />
                  ))}
                </div>
              )}

              {saveMutation.isError && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-3">
                  Failed to save. Please try again.
                </p>
              )}
            </CardBody>
          </Card>
        </div>
      </main>
    </ProtectedRoute>
  );
}
