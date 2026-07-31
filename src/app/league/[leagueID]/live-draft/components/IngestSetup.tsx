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
    // null = follow the default (open until frames arrive); true/false = user choice.
    const [expanded, setExpanded] = useState<boolean | null>(null);

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

    // Once frames flow, the setup card is pre-draft plumbing — collapse it to
    // a status line (the user can still expand it to re-copy the snippet).
    const isOpen = expanded ?? frames.length === 0;

    if (!isOpen) {
        return (
            <Card className="mb-4">
                <CardBody>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="font-semibold text-gray-900 dark:text-gray-100">
                            Live draft ingest
                        </span>
                        <span className="text-accent-700 dark:text-accent-300">✓ receiving</span>
                        <span className="text-gray-500">{frames.length} frames</span>
                        {lastFrame && (
                            <span className="text-gray-500 truncate max-w-[16rem]">
                                last: {lastFrame.data.slice(0, 40)}
                            </span>
                        )}
                        <span className="grow" />
                        <button
                            className="text-sm underline text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            onClick={() => setExpanded(true)}
                        >
                            setup
                        </button>
                    </div>
                </CardBody>
            </Card>
        );
    }

    return (
        <Card className="mb-4">
            <CardBody>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                        Live draft ingest
                    </h3>
                    <span className="flex items-center gap-2">
                        {frames.length > 0 && (
                            <Button variant="ghost" size="sm" onClick={() => setExpanded(false)}>
                                Collapse
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            size="sm"
                            loading={mintMutation.isPending}
                            onClick={() => mintMutation.mutate()}
                        >
                            {token ? 'Regenerate token' : 'Generate token'}
                        </Button>
                    </span>
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
