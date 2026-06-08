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
import { Button } from '@/ui/Button';
import { AccountBenefits } from '@/components/auth/AccountBenefits';
import { DataPreview } from '@/components/auth/DataPreview';
import { hasMigratableData, getLocalStorageDataSummary } from '@/lib/storage/migration-utils';
import type { DataSummary } from '@/lib/storage/migration-utils';
import { useSaveLeagueMutation } from '@/hooks/queries/useSaveLeagueMutation';
import { useLeaguesQuery } from '@/hooks/queries/useLeaguesQuery';

export default function Home() {
  const router = useRouter();
  const { user, signOut } = useAuth();
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
  return (
  <LoadingScreen waitFor={[{ loading: isSubmitting, message: currentProcessingMessage }]}>
      <main className="flex min-h-screen flex-col items-center pt-24 px-4 sm:px-8 lg:px-12 md:ml-44 ">
        {!isLoadingLeagues && availableLeagues.length > 0 && <Sidebar availableLeagues={availableLeagues} />}
        <div className="flex flex-col w-full max-w-6xl">
          
          {/* Account Promotion Section for Anonymous Users */}
          {showAccountPromotion && !user && (
            <section className="mb-8" aria-labelledby="welcome-heading">
              <div className="text-center mb-6">
                <h1 id="welcome-heading" className="text-4xl font-bold text-gray-900 mb-3">
                  Welcome to Draft Builder
                </h1>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  The most powerful fantasy football draft tool. Create an account to unlock cloud sync, 
                  advanced analytics, and never lose your draft data again.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-8 mb-8">
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
                  <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg p-6 text-white">
                    <h3 className="text-xl font-bold mb-3">Ready to get started?</h3>
                    <p className="text-blue-100 mb-4">
                      Join thousands of fantasy managers who trust Draft Builder with their league data.
                    </p>
                    
                    {/* Primary CTA */}
                    <Link 
                      href="/auth"
                      className="block w-full bg-white text-blue-600 hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-600 font-semibold py-3 px-6 rounded-lg text-center transition-colors mb-3"
                    >
                      {dataSummary ? 'Create Account & Migrate Data' : 'Create Free Account'}
                    </Link>
                    
                    {/* Secondary CTA */}
                    <button 
                      onClick={() => setShowAccountPromotion(false)}
                      className="block w-full text-blue-100 hover:text-white font-medium py-2 text-center transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-transparent rounded"
                      aria-label="Continue using Draft Builder without creating an account"
                    >
                      Continue without account
                    </button>
                  </div>

                  <div className="text-center text-sm text-gray-500">
                    <p>
                      Want to try first? Check out the{' '}
                      <Link href="/demo" className="text-blue-600 hover:text-blue-500 underline">
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
            <section className="mb-8 text-center" aria-labelledby="welcome-back-heading">
              <h1 id="welcome-back-heading" className="text-4xl font-bold text-gray-900 mb-3">
                Welcome back, {user.email?.split('@')[0]}!
              </h1>
              <p className="text-lg text-gray-600">
                Connect your leagues to get started with this season&apos;s drafts.
              </p>
              <div className="mt-4">
                <Button 
                  variant="ghost"
                  onClick={async () => await signOut()}
                >
                  Logout
                </Button>
              </div>
            </section>
          )}

          {/* League Connection Section */}
          <section className="flex flex-col w-full" aria-labelledby="league-connection-heading">
            <h2 id="league-connection-heading" className={`${user ? 'text-2xl' : 'text-4xl'} text-center mb-4 ${user ? 'text-gray-800' : 'text-gray-900'}`}>
              {user ? 'Connect Your League:' : showAccountPromotion ? 'Or Connect Your League:' : 'Login With:'}
            </h2>
            
            {!user && !showAccountPromotion && (
              <div className="mt-2 items-center max-w-prose mx-auto text-center">
                Curious? Try the <Link href="/demo" className="text-sky-600 hover:text-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 rounded underline">demo</Link>.
              </div>
            )}
            
            {/* Error message display */}
            {(error || submissionError) && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg" role="alert">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-red-800">{error || submissionError}</p>
                  </div>
                </div>
              </div>
            )}
            
            <div className='min-w-full w-full'>
              <TabContainer pages={[
                { title: headerFor('espn'), content: <LeagueLogin><EspnLogin submitLeague={handleSubmit} /></LeagueLogin> },
                { title: headerFor('sleeper'), content: <LeagueLogin><SleeperLogin submitLeague={handleSubmit} /></LeagueLogin> },
              ]} />
            </div>
          </section>
        </div>
      </main>
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