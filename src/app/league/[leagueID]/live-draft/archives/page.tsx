'use server'
import { isLeagueId } from '@/platforms/common';
import ErrorScreen from '@/ui/ErrorScreen';
import ArchivesList from './ArchivesList';

export default async function LiveDraftArchivesPage(
    props: Readonly<{ params: Promise<{ leagueID: string }> }>
) {
    const params = await props.params;
    if (!isLeagueId(params.leagueID)) {
        return <ErrorScreen message="Invalid league ID" />;
    }
    return <ArchivesList leagueId={params.leagueID} />;
}
