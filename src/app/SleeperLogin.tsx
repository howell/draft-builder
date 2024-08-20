'use client';
import CollapsibleComponent from '@/ui/Collapsible';
import React, { useState } from 'react';
import Image from 'next/image';
import { LeagueDataInput, LeagueLoginProps, PrivateLeagueInput, PrivateLeagueInputProps, PrivateLeagueLabel, SubmitButton } from './leagueInputs';
import { EspnLeague, SleeperLeague } from '@/platforms/common';

const SleeperLogin: React.FC<LeagueLoginProps> = ({ submitLeague }) => {
    const [leagueID, setLeagueID] = useState("");

    const handleSubmit = async () => {

      if (leagueID.trim() === "") {
        alert("Please enter your league ID");
        return;
      }

      if (isNaN(parseInt(leagueID))) {
        alert("League ID must be a number");
        return;
      }

      const id = parseInt(leagueID);
      const league: SleeperLeague = { platform: 'sleeper', id };
      await submitLeague(league);
    };

    return (
        <div>
            <h1 className="text-xl">Enter your Sleeper Fantasy Football league ID and click Submit.</h1>

            <LeagueDataInput label="League ID" value={leagueID} onChange={setLeagueID} />
            <SubmitButton onClick={handleSubmit} />
        </div>
    )
};

export default SleeperLogin;
