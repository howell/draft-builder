'use server'
import { isLeagueId } from '@/platforms/common';
import ErrorScreen from '@/ui/ErrorScreen';
import ArchiveBoard from './ArchiveBoard';

const API_KEY = process.env.GOOGLE_API_KEY;

export default async function LiveDraftArchivePage(
    props: Readonly<{ params: Promise<{ leagueID: string; archiveId: string }> }>
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
                title="Archive view unavailable"
                message="The server is missing its GOOGLE_API_KEY configuration, so player rankings cannot be loaded."
            />
        );
    }
    return (
        <ArchiveBoard
            leagueId={params.leagueID}
            archiveId={params.archiveId}
            googleApiKey={API_KEY}
        />
    );
}
