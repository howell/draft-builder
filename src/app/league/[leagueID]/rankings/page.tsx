'use server'
import { isLeagueId } from "@/platforms/common";
import CustomRankings from "./CustomRankings";
import ErrorScreen from "@/ui/ErrorScreen";

const API_KEY = process.env.GOOGLE_API_KEY;

export default async function RankingsPage(props: Readonly<{ params: Promise<{ leagueID: string }> }>) {
    const params = await props.params;
    if (!isLeagueId(params.leagueID)) {
        return <ErrorScreen message='Invalid league ID' />;
    }
    // useRankingsQuery is gated on a truthy key, so passing an unset one leaves
    // the query permanently disabled — which reads as a blank page rather than
    // an error, because a disabled query is not `isLoading`. Fail loudly here.
    if (!API_KEY) {
        return <ErrorScreen
            title='Rankings unavailable'
            message='The server is missing its GOOGLE_API_KEY configuration, so player rankings cannot be loaded.' />;
    }
    return <CustomRankings leagueId={params.leagueID} googleApiKey={API_KEY} />;
}
