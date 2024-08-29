'use server'
import MockDraft from "../MockDraft";

const API_KEY = process.env.GOOGLE_API_KEY!;

export default async function MockPage({ params }: Readonly<{ params: { leagueID: string, mock: string } }>) {
    const unescapedMock = decodeURIComponent(params.mock);
    return <MockDraft leagueId={params.leagueID} draftName={unescapedMock} googleApiKey={API_KEY} />;
}
