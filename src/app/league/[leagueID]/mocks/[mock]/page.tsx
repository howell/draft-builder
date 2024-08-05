import MockDraft from "../MockDraft";

export default function MockPage({ params }: Readonly<{ params: { leagueID: string, mock: string } }>) {
    const unescapedMock = decodeURIComponent(params.mock);
    return <MockDraft leagueId={params.leagueID} draftName={unescapedMock} />;
}
