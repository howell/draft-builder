'use server';

import { isLeagueId } from '@/platforms/common';
import ErrorScreen from '@/ui/ErrorScreen';
import DraftSimulator from './DraftSimulator';
import IngestSetup from './components/IngestSetup';

const API_KEY = process.env.GOOGLE_API_KEY!;

export default async function LiveDraftSimulatorPage(
    props: Readonly<{ params: Promise<{ leagueID: string }> }>
) {
    const params = await props.params;
    if (!isLeagueId(params.leagueID)) {
        return <ErrorScreen message="Invalid league ID" />;
    }

    return (
        <>
            <IngestSetup leagueId={params.leagueID} />
            <DraftSimulator leagueId={params.leagueID} googleApiKey={API_KEY} />
        </>
    );
}
