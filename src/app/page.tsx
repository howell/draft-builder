'use client';
import { useRouter } from 'next/navigation'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useCallback, useEffect, useState } from "react";
import ApiClient from './api/ApiClient';
import LoadingScreen from '@/ui/LoadingScreen';
import { LeagueId, Platform, PlatformLeague, platformLogo } from '@/platforms/common';
import Sidebar from '../ui/Sidebar';
import { LeagueSubmitCallback } from './leagueInputs';
import { activateLeague } from './navigation';
import EspnLogin from './EspnLogin';
import TabContainer, { TabTitle } from '@/ui/TabContainer';
import Image from 'next/image';
import Link from 'next/link';
import SleeperLogin from './SleeperLogin';
import { useAuth } from '@/lib/auth/context';
import { buttonClasses } from '@/ui/Button';
import { Alert } from '@/ui/Alert';
import { Card, CardTitle } from '@/ui/Card';
import { PageShell } from '@/ui/PageShell';
import { AppHeader } from '@/ui/AppHeader';
import { AccountBenefits } from '@/components/auth/AccountBenefits';
import { DataPreview } from '@/components/auth/DataPreview';
import { hasMigratableData, getLocalStorageDataSummary } from '@/lib/storage/migration-utils';
import type { DataSummary } from '@/lib/storage/migration-utils';
import { useSaveLeagueMutation } from '@/hooks/queries/useSaveLeagueMutation';
import { useLeaguesQuery } from '@/hooks/queries/useLeaguesQuery';

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const [findLeagueState, setFindLeagueState] = useState<{
    isLoading: boolean;
    error: string | null;
  }>({ isLoading: false, error: null });
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const [showAccountPromotion, setShowAccountPromotion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Use unified leagues query
  const leaguesQuery = useLeaguesQuery();
  const availableLeagues = leaguesQuery.data?.leagues.leagues ? Object.values(leaguesQuery.data.leagues.leagues) : [];
  const isLoadingLeagues = leaguesQuery.isLoading;
  
  const saveLeagueMutation = useSaveLeagueMutation({
    onSuccess: (data, variables) => {
      console.log('[Home] League saved successfully, navigating...');
      
      // Clean up all states before navigation
      setFindLeagueState({ isLoading: false, error: null });
      setError(null);
      
      try {
        activateLeague(variables.league, router);
      } catch (navigationError) {
        console.error('[Home] Navigation failed:', navigationError);
        setError('League saved but navigation failed. Please try refreshing the page.');
      }
    },
    onError: (error) => {
      console.error('[Home] Save league failed:', error);
      setFindLeagueState({ isLoading: false, error: null });
      setError(`Failed to save league: ${error.message}`);
    }
  });

  // Derived states for loading and processing
  const isSubmitting = findLeagueState.isLoading || saveLeagueMutation.isPending;
  const submissionError = findLeagueState.error || (saveLeagueMutation.error ? `Failed to save league: ${saveLeagueMutation.error.message}` : null);
  const currentProcessingMessage = findLeagueState.isLoading ? 'Finding League' : 
                                  saveLeagueMutation.isPending ? 'Saving League' : '';

  // Check for migratable data and show account promotion for anonymous users
  useEffect(() => {
    const checkForMigratableData = async () => {
      if (!user) {
        try {
          const hasData = await hasMigratableData();
          if (hasData) {
            const summary = await getLocalStorageDataSummary();
            setDataSummary(summary);
          }
          setShowAccountPromotion(true);
        } catch (error) {
          console.warn('Failed to check for migratable data:', error);
          setShowAccountPromotion(true); // Show for all anonymous users
        }
      } else {
        setShowAccountPromotion(false);
      }
    };
    
    checkForMigratableData();
  }, [user]);

  // Recovery mechanism: if the save mutation is idle but findLeague is still marked
  // loading, reset it. Done during render (guarded so it self-terminates) rather than
  // in an effect to avoid an extra render pass.
  if (saveLeagueMutation.status === 'idle' && findLeagueState.isLoading) {
    setFindLeagueState({ isLoading: false, error: null });
  }

  const handleSubmit: LeagueSubmitCallback = useCallback(async (league: PlatformLeague) => {
    if (isSubmitting) return;
    
    console.log('[Home] Starting league submission:', league);
    
    try {
      // Clear any previous errors
      setError(null);
      setFindLeagueState({ isLoading: true, error: null });
      
      // First verify the league exists via API
      const client = new ApiClient(league);
      const result = await client.findLeague();
      
      if (typeof result === 'string') {
        setFindLeagueState({ isLoading: false, error: `Failed to find league: ${result}` });
        return;
      }
      
      if (result?.status !== 'ok') {
        setFindLeagueState({ isLoading: false, error: `Error finding league: ${result.status}` });
        return;
      }
      
      // League found, now transition to save phase
      console.log('[Home] League found, saving...');
      setFindLeagueState({ isLoading: false, error: null });
      
      // Save the league (mutation handles its own loading/error states)
      try {
        await saveLeagueMutation.mutateAsync({ league });
        // Navigation happens in mutation onSuccess callback
      } catch (mutationError) {
        console.error('[Home] Save mutation failed:', mutationError);
        // Don't set findLeagueState error here, let the mutation's onError handle it
        // This prevents double error handling
      }
      
    } catch (error) {
      console.error('[Home] Submit error during API phase:', error);
      // Only handle errors that occurred during the find league phase
      if (findLeagueState.isLoading) {
        setFindLeagueState({ isLoading: false, error: `Unexpected error: ${error}` });
      }
    }
  }, [isSubmitting, saveLeagueMutation, findLeagueState.isLoading]);

  // Cleanup effect to reset states when component unmounts
  useEffect(() => {
    return () => {
      console.log('[Home] Component unmounting, cleaning up states');
      setFindLeagueState({ isLoading: false, error: null });
      setError(null);
    };
  }, []);
  const hasSidebar = !isLoadingLeagues && availableLeagues.length > 0;

  return (
  <LoadingScreen waitFor={[{ loading: isSubmitting, message: currentProcessingMessage }]}>
      <PageShell maxWidth="6xl" sidebarOffset={hasSidebar} header={<AppHeader />}>
        {hasSidebar && <Sidebar availableLeagues={availableLeagues} />}

        {/* Account Promotion Section for Anonymous Users */}
        {showAccountPromotion && !user && (
          <section className="mt-8 mb-8" aria-labelledby="welcome-heading">
            <div className="text-center mb-8">
              <h1 id="welcome-heading" className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                Welcome to Draft Builder
              </h1>
              <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                The most powerful fantasy football draft tool. Create an account to unlock cloud sync,
                advanced analytics, and never lose your draft data again.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8 mb-8 md:items-start">
              {/* Left Column: Account Benefits */}
              <div className="space-y-6">
                <AccountBenefits
                  dataSummary={dataSummary || undefined}
                  compact={true}
                />

                {dataSummary && (
                  <DataPreview
                    dataSummary={dataSummary}
                    showDetails={false}
                  />
                )}
              </div>

              {/* Right Column: Call to Action */}
              <div className="space-y-4">
                <Card>
                  <CardTitle>Ready to get started?</CardTitle>
                  <p className="text-gray-600 dark:text-gray-400 mt-2 mb-5">
                    Join thousands of fantasy managers who trust Draft Builder with their league data.
                  </p>

                  {/* Primary CTA */}
                  <Link href="/auth?mode=signup" className={buttonClasses('primary', 'lg', true)}>
                    {dataSummary ? 'Create Account & Migrate Data' : 'Create Free Account'}
                  </Link>

                  <p className="mt-4 text-sm text-center text-gray-600 dark:text-gray-400">
                    Already have an account?{' '}
                    <Link
                      href="/auth"
                      className="font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                    >
                      Sign in
                    </Link>
                  </p>

                  {/* Secondary CTA */}
                  <button
                    onClick={() => setShowAccountPromotion(false)}
                    className="block w-full mt-3 py-2 text-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 rounded"
                    aria-label="Continue using Draft Builder without creating an account"
                  >
                    Continue without account
                  </button>
                </Card>

                <div className="text-center text-sm text-gray-500 dark:text-gray-400">
                  <p>
                    Want to try first? Check out the{' '}
                    <Link href="/demo" className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 underline">
                      demo
                    </Link>
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Authenticated User Welcome */}
        {user && (
          <section className="mt-8 mb-8 text-center" aria-labelledby="welcome-back-heading">
            <h1 id="welcome-back-heading" className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-3">
              Welcome back, {user.email?.split('@')[0]}!
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              Connect your leagues to get started with this season&apos;s drafts.
            </p>
          </section>
        )}

        {/* League Connection Section */}
        <section className="flex flex-col w-full" aria-labelledby="league-connection-heading">
          <h2 id="league-connection-heading" className={`${user ? 'text-2xl' : 'text-4xl'} text-center mb-4 ${user ? 'text-gray-800 dark:text-gray-200' : 'text-gray-900 dark:text-gray-100'}`}>
            {user ? 'Connect Your League:' : showAccountPromotion ? 'Or Connect Your League:' : 'Login With:'}
          </h2>

          {!user && !showAccountPromotion && (
            <div className="mt-2 items-center max-w-prose mx-auto text-center text-gray-700 dark:text-gray-300">
              Curious? Try the <Link href="/demo" className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded underline">demo</Link>.
            </div>
          )}

          {/* Error message display */}
          {(error || submissionError) && (
            <Alert variant="error" className="mb-4">
              {error || submissionError}
            </Alert>
          )}

          <div className='min-w-full w-full'>
            <TabContainer pages={[
              { title: headerFor('espn'), content: <LeagueLogin><EspnLogin submitLeague={handleSubmit} /></LeagueLogin> },
              { title: headerFor('sleeper'), content: <LeagueLogin><SleeperLogin submitLeague={handleSubmit} /></LeagueLogin> },
            ]} />
          </div>
        </section>
      </PageShell>
    </LoadingScreen>
  );
}


function headerFor(platform: Platform): TabTitle {
  const logo = platformLogo(platform);
  const component = (selected: boolean) => {
    return (
      <div className={`w-10 pb-2 ${selected ? 'border-blue-400 border-b-2 border-opacity-75 ' : ''}`}>
        <Image src={logo} alt={platform + " logo"} />
      </div>
    );
  };
  component.displayName = `TabTitle(${platform})`;
  return component;
}

const LeagueLogin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-w-full p-4">
      {children}
    </div>
  );
}