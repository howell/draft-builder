'use client';
import { useRouter } from 'next/navigation'
import { useState } from "react";
import CollapsibleComponent from './Collapsible';
import './page.css'

export default function Home() {
  const [leagueID, setLeagueID] = useState("");
  const [swid, setSwid] = useState("");
  const [espnS2, setEspnS2] = useState("");
  const router = useRouter();

  const handleSubmit = () => {
    // event.preventDefault();

    // Perform validation here
    if (leagueID.trim() === "") {
      alert("Please enter your league ID");
      return;
    }

    if (swid.trim() === "" && espnS2.trim() !== "") {
      alert("Please enter your SWID");
      return;
    }

    if (espnS2.trim() === "" && swid.trim() !== "") {
      alert("Please enter your ESPN_S2");
      return;
    }

    // If all inputs are valid, proceed with form submission
    router.push(`/league/${leagueID}?swid=${swid}&espn_s2=${espnS2}`);

    // Reset the form inputs
    setLeagueID("");
    setSwid("");
    setEspnS2("");
  };

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
          <p/>
          <p/>
          
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
