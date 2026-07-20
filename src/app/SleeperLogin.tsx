'use client';
import React, { useState } from 'react';
import { LeagueDataInput, LeagueLoginProps, PrivateLeagueInput, PrivateLeagueInputProps, PrivateLeagueLabel, SubmitButton } from './leagueInputs';
import { isLeagueId, SleeperLeague } from '@/platforms/common';

const SleeperLogin: React.FC<LeagueLoginProps> = ({ submitLeague }) => {
    const [leagueID, setLeagueID] = useState("");
    const [validationError, setValidationError] = useState<string | null>(null);

    const handleSubmit = async () => {
      setValidationError(null);

      if (leagueID.trim() === "") {
        setValidationError("Please enter your league ID");
        return;
      }

      if (!isLeagueId(leagueID)) {
        setValidationError("League ID must be a number");
        return;
      }

      const league: SleeperLeague = { platform: 'sleeper', id: leagueID };
      await submitLeague(league);
    };

    return (
        <div>
            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">Enter your Sleeper Fantasy Football league ID and click Submit.</p>

            <LeagueDataInput label="League ID" value={leagueID} onChange={setLeagueID} />

            {validationError && (
                <div className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
                    {validationError}
                </div>
            )}
            
            <SubmitButton onClick={handleSubmit} />
        </div>
    )
};

export default SleeperLogin;
