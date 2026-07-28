'use server'
import { isLeagueId } from '@/platforms/common';
import ErrorScreen from '@/ui/ErrorScreen';
import DraftSimulator from '../DraftSimulator';

const API_KEY = process.env.GOOGLE_API_KEY;

export default async function DraftSimulatorPage(
    props: Readonly<{ params: Promise<{ leagueID: string }> }>
) {
    const params = await props.params;
    if (!isLeagueId(params.leagueID)) {
        return <ErrorScreen message="Invalid league ID" />;
    }
    // The simulator's data layer gates its rankings query on a truthy key, so
    // an unset one reads as a permanently blank page. Fail loudly instead.
    if (!API_KEY) {
        return (
            <ErrorScreen
                title="Simulator unavailable"
                message="The server is missing its GOOGLE_API_KEY configuration, so player rankings cannot be loaded."
            />
        );
    }
    return <DraftSimulator leagueId={params.leagueID} googleApiKey={API_KEY} />;
}
