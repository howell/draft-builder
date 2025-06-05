'use server'
import MockDraft from "../MockDraft";

const API_KEY = process.env.GOOGLE_API_KEY!;

export default async function MockPage({ params }: Readonly<{ params: Promise<{ leagueID: string, mock: string }> }>) {
    const { leagueID, mock } = await params;
    const unescapedMock = decodeURIComponent(mock);
    return <MockDraft leagueId={leagueID} draftName={unescapedMock} googleApiKey={API_KEY} />;
}
