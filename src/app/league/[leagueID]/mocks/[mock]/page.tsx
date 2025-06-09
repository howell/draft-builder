'use server'
import MockDraft from "../MockDraft";

const API_KEY = process.env.GOOGLE_API_KEY!;

export default async function MockPage(props: Readonly<{ params: Promise<{ leagueID: string, mock: string }> }>) {
    const params = await props.params;
    const unescapedMock = decodeURIComponent(params.mock);
    return <MockDraft leagueId={params.leagueID} draftName={unescapedMock} googleApiKey={API_KEY} />;
}
