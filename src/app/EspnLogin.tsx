'use client';
import CollapsibleComponent from '@/ui/Collapsible';
import React, { useState } from 'react';
import Image from 'next/image';
import { LeagueDataInput, LeagueLoginProps, PrivateLeagueInput, PrivateLeagueLabel, SubmitButton } from './leagueInputs';
import { EspnLeague } from '@/platforms/common';

const EspnLogin: React.FC<LeagueLoginProps> = ({ submitLeague }) => {
    const [leagueID, setLeagueID] = useState("");
    const [swid, setSwid] = useState("");
    const [espnS2, setEspnS2] = useState("");

    const handleSubmit = async () => {

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
      await submitLeague(league);
    };

    return (
        <div>
            <h1 className="text-xl">Enter your ESPN Fantasy Football league ID and click Submit.</h1>

            <LeagueDataInput label="League ID" value={leagueID} onChange={setLeagueID} />
            <SubmitButton onClick={handleSubmit} />

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
                        <div className='max-w-prose mt-2'>
                            To find your espn_S2 and SWID, log into ESPN Fantasy Football in your browser, open the developer tools, and look for the cookies associated with the ESPN website.
                            The espn_S2 cookie is the value you need for espn_S2, and the SWID cookie is the value you need for SWID. The gif below shows how to find these values in Chrome.
                            <div className="mt-4">
                                <Image src="/find-cookies.gif" alt="How to find espn_S2 and SWID in Chrome" width={1920} height={1247} />
                            </div>
                        </div>
                    </div>
                </CollapsibleComponent>
            </div>
        </div>
    )
};

export default EspnLogin;