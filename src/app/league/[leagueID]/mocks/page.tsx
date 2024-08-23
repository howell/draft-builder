import { isLeagueId } from "@/platforms/common";
import MockDraft from "./MockDraft";
import ErrorScreen from "@/ui/ErrorScreen";

export default function MockPage({ params }: Readonly<{ params: { leagueID: string } }>) {
    if (!isLeagueId(params.leagueID)) {
        return <ErrorScreen message='Invalid league ID' />;
    }
    return <MockDraft leagueId={params.leagueID}/>;
}