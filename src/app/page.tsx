'use client';
import { useRouter } from 'next/navigation'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useCallback, useEffect, useState } from "react";
import ApiClient from './api/ApiClient';
import LoadingScreen, { LoadingTasks } from '@/ui/LoadingScreen';
import { Platform, PlatformLeague, platformLogo } from '@/platforms/common';
import { loadLeagues, saveLeague } from './localStorage';
import Sidebar from '../ui/Sidebar';
import { LeagueSubmitCallback } from './leagueInputs';
import { activateLeague } from './navigation';
import EspnLogin from './EspnLogin';
import TabContainer from '@/ui/TabContainer';
import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const [submissionInProgress, setSubmissionInProgress] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState<LoadingTasks>({});
  const [availableLeagues, setAvailableLeagues] = useState<PlatformLeague[]>([]);

  useEffect(() => {
    const availableLeagues = loadLeagues();
    console.log(availableLeagues);
    setAvailableLeagues(Object.values(availableLeagues.leagues));
  }, []);

  const handleSubmit: LeagueSubmitCallback = useCallback(async (league: PlatformLeague) => {
    if (submissionInProgress) return;
    try {
      setSubmissionInProgress(true);
      await submitLeague(league, router, setLoadingTasks, saveLeague);
    } finally {
      setSubmissionInProgress(false);
    }
  }, [submissionInProgress, router]);

  if (submissionInProgress) {
    return <LoadingScreen tasks={loadingTasks} />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center pt-24 px-12 md:ml-44 ">
      {availableLeagues.length > 0 && <Sidebar availableLeagues={availableLeagues} />}
      <div className="flex flex-col w-full">
        <h1 className="text-4xl text-center mb-4">Login With:</h1>
        <div className="mt-2 items-center max-w-prose">
          Curious? Try the <Link href="/demo"><span className='text-sky-600'>demo</span></Link>.
        </div>
        <div className='min-w-full w-full'>
          <TabContainer pages={[
            { title: headerFor('espn'), content: <LeagueLogin><EspnLogin submitLeague={handleSubmit} /></LeagueLogin> },
            { title: headerFor('yahoo'), content: <LeagueLogin><div>Coming Soon</div></LeagueLogin> },
            { title: headerFor('sleeper'), content: <LeagueLogin><div>Coming Soon</div></LeagueLogin> },
          ]} />
        </div>
      </div>
    </main>
  );
}

export async function submitLeague(league: PlatformLeague,
  router: AppRouterInstance,
  setLoadingTasks: (tasks: LoadingTasks) => void,
  saveLeague: (id: number, league: PlatformLeague) => void)
   {
  const client = new ApiClient(league);
  const request = client.findLeague();
  setLoadingTasks({ 'Finding League': request });
  const result = await request;

  if (typeof result === 'string') {
    alert(`Failed to find league: ${result}`);
    return;
  }
  if (result?.status !== 'ok') {
    alert(`Error finding league: ${result.status}`);
    return;
  }

  saveLeague(league.id, league);
  activateLeague(league, router);
}

export function headerFor(platform: Platform) {
  const logo = platformLogo(platform);
  return (
    <div className='w-10'>
      <Image src={logo} alt={platform + " logo"} />
    </div>
  );
}

export const LeagueLogin: React.FC<{children: React.ReactNode}> = ({ children }) => {
  return (
    <div className="min-w-full min-h-60 p-4">
      {children}
    </div>
  );
}