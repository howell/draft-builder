'use server';

/**
 * Dev-only entry point for the live-draft simulator.
 *
 * Gated behind a feature flag so the live-draft feature stays deferred for v1
 * (no production page, no sidebar nav link — see CLAUDE.md). Reachable locally
 * with NEXT_PUBLIC_ENABLE_LIVE_DRAFT_SIM=1 or in development.
 */

import { notFound } from 'next/navigation';
import { isLeagueId } from '@/platforms/common';
import ErrorScreen from '@/ui/ErrorScreen';
import DraftSimulator from './DraftSimulator';
import IngestSetup from './components/IngestSetup';

const API_KEY = process.env.GOOGLE_API_KEY!;

function simulatorEnabled(): boolean {
    return (
        process.env.NEXT_PUBLIC_ENABLE_LIVE_DRAFT_SIM === '1' ||
        process.env.NODE_ENV === 'development'
    );
}

export default async function LiveDraftSimulatorPage(
    props: Readonly<{ params: Promise<{ leagueID: string }> }>
) {
    if (!simulatorEnabled()) {
        notFound();
    }

    const params = await props.params;
    if (!isLeagueId(params.leagueID)) {
        return <ErrorScreen message="Invalid league ID" />;
    }

    return (
        <>
            <IngestSetup leagueId={params.leagueID} />
            <DraftSimulator leagueId={params.leagueID} googleApiKey={API_KEY} />
        </>
    );
}
