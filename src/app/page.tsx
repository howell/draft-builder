'use client';
import { useRouter } from 'next/navigation'
import { useState } from "react";
import CollapsibleComponent from '@/ui/Collapsible';
import Cookies from 'js-cookie';
import './page.css'
import ApiClient from './api/ApiClient';
import LoadingScreen, { LoadingTasks } from '@/ui/LoadingScreen';
import { EspnLeague } from '@/platforms/common';
import { activateLeague } from './navigation';

export default function Home() {
  const [leagueID, setLeagueID] = useState("");
  const [swid, setSwid] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const router = useRouter();
  const [submissionInProgress, setSubmissionInProgress] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState<LoadingTasks>({});

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

      const client = new ApiClient('espn', parseInt(leagueID));
      const request = client.findLeague(actualSwid && actualEspnS2 ? { swid, espnS2 } : undefined);
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

      const league: EspnLeague = { platform: 'espn', id: parseInt(leagueID), swid: actualSwid, espnS2: actualEspnS2 };

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
      <div className="flex flex-col">
        <h1 className="league-id-header">To get started, enter your ESPN Fantasy Football league ID and click 'Submit'.</h1>
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
        <p />
        <p />

        <div className="margin-top-20">
          <CollapsibleComponent label={<h2 className="private-league-header">Private League?</h2>}>
            <div className="private-league-content">
              <div>
                <label>For private leagues, enter your ESPN_S2 and SWID:</label>
              </div>
              <div className="private-league-input">
                <label>ESPN_S2:</label>
                <input
                  className="w-90 h-12 p-2 mt-2 text-black bg-white border border-gray-300 rounded-lg"
                  type="text"
                  name="espn_s2"
                  value={espnS2}
                  onChange={(event) => setEspnS2(event.target.value)}
                />
              </div>
              <div className="private-league-input">
                <label>SWID:</label>
                <input
                  className="w-90 h-12 p-2 mt-2 text-black bg-white border border-gray-300 rounded-lg"
                  type="text"
                  name="swid"
                  value={swid}
                  onChange={(event) => setSwid(event.target.value)}
                />
              </div>
            </div>
          </CollapsibleComponent>
        </div>
      </div>
    </main>
  );
}
