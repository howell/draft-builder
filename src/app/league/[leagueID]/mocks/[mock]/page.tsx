import MockDraft from "../MockDraft";

export default async function MockPage({ params }: Readonly<{ params: { leagueID: string, mock: string } }>) {
    const unescapedMock = decodeURIComponent(params.mock);
    return MockDraft(params.leagueID, unescapedMock);
}
