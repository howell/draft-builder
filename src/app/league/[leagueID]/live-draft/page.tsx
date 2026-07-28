'use server'
import { isLeagueId } from '@/platforms/common';
import ErrorScreen from '@/ui/ErrorScreen';
import LiveDraftBoard from './LiveDraftBoard';
import IngestSetup from './components/IngestSetup';

const API_KEY = process.env.GOOGLE_API_KEY;

/**
 * The game-day page: a read-only board driven by ingested draft-room frames,
 * with the ingest setup (token + userscript snippet) below it. The model lab
 * lives at ./simulator.
 */
export default async function LiveDraftPage(
    props: Readonly<{ params: Promise<{ leagueID: string }> }>
) {
    const params = await props.params;
    if (!isLeagueId(params.leagueID)) {
        return <ErrorScreen message="Invalid league ID" />;
    }
    // The board's data layer gates its rankings query on a truthy key, so an
    // unset one reads as a permanently blank page. Fail loudly instead.
    if (!API_KEY) {
        return (
            <ErrorScreen
                title="Live draft unavailable"
                message="The server is missing its GOOGLE_API_KEY configuration, so player rankings cannot be loaded."
            />
        );
    }
    return (
        <>
            <LiveDraftBoard leagueId={params.leagueID} googleApiKey={API_KEY} />
            <div className="max-w-6xl mx-auto p-4">
                <IngestSetup leagueId={params.leagueID} />
            </div>
        </>
    );
}
