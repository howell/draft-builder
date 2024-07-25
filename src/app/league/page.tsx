
export default function Page({params, searchParams} : Readonly<{params: Record<string, string>, searchParams: { leagueID: string}}>) {
    const leagueID = searchParams.leagueID;

    return (
        <div className="flex min-h-screen flex-col items-center justify-between p-24">
            Welcome to league {leagueID}!
        </div>
    );
}