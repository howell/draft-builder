'use client';

import { useState } from 'react';
import { Card, CardBody } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { useAuth } from '@/lib/auth/context';
import {
    useLiveDraftIngestTokenQuery,
    useMintLiveDraftIngestTokenMutation,
} from '@/hooks/queries/useLiveDraftIngestToken';
import { useLiveDraftFramesQuery } from '@/hooks/queries/useLiveDraftFrames';
import type { LeagueId } from '@/platforms/common';

/**
 * Dev-gated setup panel for the draft-room tap userscript: mints the ingest
 * token, shows the console snippet to paste in the ESPN draft-room tab, and
 * a live readout of ingested frames (proves the ingest → poll loop works).
 */
export default function IngestSetup({ leagueId }: Readonly<{ leagueId: LeagueId }>) {
    const { user } = useAuth();
    const tokenQuery = useLiveDraftIngestTokenQuery();
    const mintMutation = useMintLiveDraftIngestTokenMutation();
    const framesQuery = useLiveDraftFramesQuery(leagueId);
    const [copied, setCopied] = useState(false);

    if (!user) {
        return (
            <Card className="mb-4">
                <CardBody>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Sign in to set up live draft ingest.
                    </p>
                </CardBody>
            </Card>
        );
    }

    const token = tokenQuery.data;
    // draftBuilderLeagueId pins frames to THIS league even when the draft
    // room's socket uses a throwaway lobby id (ESPN practice drafts).
    const snippet = token
        ? [
            `localStorage.setItem('draftBuilderIngestUrl', '${typeof window !== 'undefined' ? window.location.origin : ''}/api/live-draft-ingest');`,
            `localStorage.setItem('draftBuilderIngestToken', '${token}');`,
            `localStorage.setItem('draftBuilderLeagueId', '${leagueId}');`,
        ].join('\n')
        : '';

    const copySnippet = async () => {
        await navigator.clipboard.writeText(snippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const frames = framesQuery.data ?? [];
    const lastFrame = frames[frames.length - 1];

    return (
        <Card className="mb-4">
            <CardBody>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                        Live draft ingest
                    </h3>
                    <Button
                        variant="secondary"
                        size="sm"
                        loading={mintMutation.isPending}
                        onClick={() => mintMutation.mutate()}
                    >
                        {token ? 'Regenerate token' : 'Generate token'}
                    </Button>
                </div>

                {token ? (
                    <>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                            Paste this in the ESPN draft-room tab&apos;s console (the tap
                            userscript reads it). Regenerating kills the old token —
                            recommended after each draft, since it lives in
                            localStorage on espn.com.
                        </p>
                        <pre className="text-xs bg-gray-100 dark:bg-gray-800 rounded p-2 overflow-x-auto mb-2">
                            {snippet}
                        </pre>
                        <Button variant="ghost" size="sm" onClick={copySnippet}>
                            {copied ? 'Copied!' : 'Copy snippet'}
                        </Button>
                    </>
                ) : (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Generate a token to let the draft-room userscript forward frames here.
                    </p>
                )}

                <div className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium">{frames.length}</span> frames ingested for this league
                    {lastFrame && (
                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                            last: {lastFrame.data.slice(0, 80)}
                        </span>
                    )}
                </div>
            </CardBody>
        </Card>
    );
}
