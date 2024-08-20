'use client';
import { useRouter } from 'next/navigation'
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useCallback, useEffect, useState } from "react";
import ApiClient from './api/ApiClient';
import LoadingScreen, { LoadingTasks } from '@/ui/LoadingScreen';
import { PlatformLeague } from '@/platforms/common';
import { loadLeagues, saveLeague } from './localStorage';
import Sidebar from '../ui/Sidebar';
import { LeagueSubmitCallback } from './leagueInputs';
import { activateLeague } from './navigation';
import EspnLogin from './EspnLogin';

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
    <main className="flex min-h-screen flex-col items-center p-24">
      {availableLeagues.length > 0 && <Sidebar availableLeagues={availableLeagues} />}
      <div className="flex flex-col">
        <h1 className="text-4xl mb-4">Login With:</h1>
        <EspnLogin submitLeague={handleSubmit} />
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
