'use client';
import React, { useState } from 'react';
import { LeagueDataInput, LeagueLoginProps, PrivateLeagueInput, PrivateLeagueInputProps, PrivateLeagueLabel, SubmitButton } from './leagueInputs';
import { isLeagueId, SleeperLeague } from '@/platforms/common';

const SleeperLogin: React.FC<LeagueLoginProps> = ({ submitLeague }) => {
    const [leagueID, setLeagueID] = useState("");

    const handleSubmit = async () => {

      if (leagueID.trim() === "") {
        alert("Please enter your league ID");
        return;
      }

      

      if (!isLeagueId(leagueID)) {
        alert("League ID must be a number");
        return;
      }

      const league: SleeperLeague = { platform: 'sleeper', id: leagueID };
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
