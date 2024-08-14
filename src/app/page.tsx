'use client';
import { useRouter } from 'next/navigation'
import { useEffect, useState } from "react";
import CollapsibleComponent from '@/ui/Collapsible';
import ApiClient from './api/ApiClient';
import LoadingScreen, { LoadingTasks } from '@/ui/LoadingScreen';
import { EspnLeague, PlatformLeague } from '@/platforms/common';
import { activateLeague } from './navigation';
import { loadLeagues, saveLeague } from './localStorage';
import Sidebar from '../ui/Sidebar';
import Link from 'next/link';

export default function Home() {
  const [leagueID, setLeagueID] = useState("");
  const [swid, setSwid] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const router = useRouter();
  const [submissionInProgress, setSubmissionInProgress] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState<LoadingTasks>({});
  const [availableLeagues, setAvailableLeagues] = useState<PlatformLeague[]>([]);

  useEffect(() => {
    const availableLeagues = loadLeagues();
    console.log(availableLeagues);
    setAvailableLeagues(Object.values(availableLeagues.leagues));
  }, []);

  const handleSubmit = async () => {
    if (submissionInProgress) return;
    setSubmissionInProgress(true);
    try {

      if (leagueID.trim() === "") {
        alert("Please enter your league ID");
        return;
      }

      if (isNaN(parseInt(leagueID))) {
        alert("League ID must be a number");
        return;
      }

      let providedSwid = swid.trim();
      let providedEspnS2 = espnS2.trim();
      if (providedSwid === "" && providedEspnS2 !== "") {
        alert("Please enter your SWID");
        return;
      }

      if (providedEspnS2 === "" && providedSwid !== "") {
        alert("Please enter your ESPN_S2");
        return;
      }

      const actualSwid = providedSwid === "" ? undefined : providedSwid;
      const actualEspnS2 = providedEspnS2 === "" ? undefined : providedEspnS2;

      const id = parseInt(leagueID);
      const auth = actualSwid && actualEspnS2 ? { swid: actualSwid, espnS2: actualEspnS2 } : undefined;
      const league: EspnLeague = { platform: 'espn', id, auth };
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
    } finally {
      setSubmissionInProgress(false);
    }
  };
  
  if (submissionInProgress) {
    return <LoadingScreen tasks={loadingTasks}/>;
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      {availableLeagues.length > 0 && <Sidebar availableLeagues={availableLeagues} />}
      <div className="flex flex-col">
        <h1 className="text-xl">To get started, enter your ESPN Fantasy Football league ID and click Submit.</h1>
        <input
          className="w-full h-12 p-2 mt-4 text-black bg-white border border-gray-300 rounded-lg"
          type="text"
          name="leagueID"
          value={leagueID}
          onChange={(event) => setLeagueID(event.target.value)}
        />
        <button onClick={handleSubmit} className="w-full p-2 mt-4 text-white bg-black border border-gray-300 rounded-lg">
          Submit
        </button>

        <div className="mt-5">
          <CollapsibleComponent label={<h2 className="">Private League?</h2>}>
            <div className="flex flex-col items-start">
              <div>
                <label>For private leagues, enter your espn_S2 and SWID:</label>
              </div>
              <div className="w-full grid grid-cols-2 gap-1 items-center justify-start mt-2">
                <PrivateLeagueLabel label="espn_S2" />
                <PrivateLeagueInput label="espn_S2" value={espnS2} onChange={setEspnS2} />
                <PrivateLeagueLabel label="SWID" />
                <PrivateLeagueInput label="SWID" value={swid} onChange={setSwid} />
              </div>
              <p className='max-w-prose mt-2'>
                To find your espn_S2 and SWID, log into ESPN Fantasy Football in your browser, open the developer tools, and look for the cookies associated with the ESPN website.
                The espn_S2 cookie is the value you need for espn_S2, and the SWID cookie is the value you need for SWID.
              </p>
            </div>
          </CollapsibleComponent>
          <div className="mt-10 items-center max-w-prose">
            Curious? Try the <Link href="/demo"><span className='text-sky-600'>demo</span></Link>.
          </div>
        </div>
      </div>
    </main>
  );
}

const PrivateLeagueLabel: React.FC<{ label: string }> = ({ label }) => {
  return (
    <label className='w-1/10 text-left'>{label}:</label>
  );
}

type PrivateLeagueInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

const PrivateLeagueInput: React.FC<PrivateLeagueInputProps> = ({ label, value, onChange }) => {
  return (
    <input
      className="col-span-3 h-12 p-2 mt-2 text-black bg-white border border-gray-300 rounded-lg"
      type="text"
      name={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
};