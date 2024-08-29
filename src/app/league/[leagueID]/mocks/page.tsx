'use server'
import { isLeagueId } from "@/platforms/common";
import MockDraft from "./MockDraft";
import ErrorScreen from "@/ui/ErrorScreen";

const API_KEY = process.env.GOOGLE_API_KEY!;

export default async function MockPage({ params }: Readonly<{ params: { leagueID: string } }>) {
    if (!isLeagueId(params.leagueID)) {
        return <ErrorScreen message='Invalid league ID' />;
    }
    return <MockDraft leagueId={params.leagueID} googleApiKey={API_KEY}/>;
}