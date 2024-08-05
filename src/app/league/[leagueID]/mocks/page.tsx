import MockDraft from "./MockDraft";

export default function MockPage({ params }: Readonly<{ params: { leagueID: string } }>) {
    return <MockDraft leagueId={params.leagueID}/>;
}