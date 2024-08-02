import MockDraft from "./MockDraft";

export default async function MockPage({ params }: Readonly<{ params: { leagueID: string } }>) {
    return MockDraft(params.leagueID);
}