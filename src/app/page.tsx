'use client';
import { useRouter } from 'next/navigation'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useCallback, useEffect, useState } from "react";
import ApiClient from './api/ApiClient';
import LoadingScreen from '@/ui/LoadingScreen';
import { LeagueId, Platform, PlatformLeague, platformLogo } from '@/platforms/common';
import type { StorageAdapter } from '@/lib/storage/interface';
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

export default function Home() {
  const router = useRouter();
  const { user, storageAdapter, signOut } = useAuth();
  const [submissionInProgress, setSubmissionInProgress] = useState(false);
  const [isProcessingLeague, setIsProcessingLeague] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  const [availableLeagues, setAvailableLeagues] = useState<PlatformLeague[]>([]);
  const [isLoadingLeagues, setIsLoadingLeagues] = useState(true);
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const [showAccountPromotion, setShowAccountPromotion] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoadingLeagues(true);
        const availableLeagues = await storageAdapter.loadLeagues();
        setAvailableLeagues(Object.values(availableLeagues.leagues));
      } catch (error) {
        console.error('Failed to load leagues:', error);
        setAvailableLeagues([]);
      } finally {
        setIsLoadingLeagues(false);
      }
    };
    loadData();
  }, [storageAdapter]);

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

  const handleSubmit: LeagueSubmitCallback = useCallback(async (league: PlatformLeague) => {
    if (submissionInProgress) return;
    try {
      setSubmissionInProgress(true);
      setError(null); // Clear any previous errors
      await submitLeague(league, router, setIsProcessingLeague, setProcessingMessage, storageAdapter, setError);
    } finally {
      setSubmissionInProgress(false);
    }
  }, [submissionInProgress, router, storageAdapter]);

  // if (submissionInProgress) {
  //   return <LoadingScreen tasks={loadingTasks} />;
  // }
  return (
  <LoadingScreen waitFor={[{ loading: isProcessingLeague, message: processingMessage }]}>
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
            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg" role="alert">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="ml-3">
                    <p className="text-sm font-medium text-red-800">{error}</p>
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

async function submitLeague(league: PlatformLeague,
  router: AppRouterInstance,
  setIsProcessing: (loading: boolean) => void,
  setProcessingMessage: (message: string) => void,
  storageAdapter: StorageAdapter,
  setError: (error: string | null) => void) {
  try {
    console.log('[Home] Starting submitLeague with:', league);
    
    const client = new ApiClient(league);
    const request = client.findLeague();
    setIsProcessing(true);
    setProcessingMessage('Finding League');
    const result = await request;

    console.log('[Home] findLeague result:', result);
    if (typeof result === 'string') {
      console.log('[Home] findLeague failed with string result:', result);
      setError(`Failed to find league: ${result}`);
      setIsProcessing(false);
      setProcessingMessage('');
      return;
    }
    if (result?.status !== 'ok') {
      console.log('[Home] findLeague failed with status:', result.status);
      setError(`Error finding league: ${result.status}`);
      setIsProcessing(false);
      setProcessingMessage('');
      return;
    }

    await storageAdapter.saveLeague(league.id, league);
    
    // Just navigate - no need to clear loading state since we're leaving the page
    activateLeague(league, router);
  } catch (error) {
    console.error('[Home] Unexpected error in submitLeague:', error);
    setError(`Unexpected error: ${error}`);
    setIsProcessing(false);
    setProcessingMessage('');
    return;
  }
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