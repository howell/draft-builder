'use client';

/**
 * Pins the ranked player pool the moment a live draft starts, so every
 * consumer (board fold, predictions, archiving) keeps pricing against the
 * draft-night inputs for the rest of the draft.
 *
 * Why pinning is necessary and archive-time capture is not enough: the
 * board's sticker basis is ESPN's live market value (`draftAuctionValue`),
 * which ESPN zeroes almost immediately after a draft completes — and the
 * pool query refetches every few minutes, so even archiving right after the
 * hammer can freeze a re-fetched, zeroed pool (the 2026 real draft's
 * stickers were lost exactly this way). Persisted in localStorage so a
 * mid-draft page reload keeps the draft-start pool.
 *
 * Pin lifecycle: set once when frames first arrive with a non-empty pool
 * (opening the page days early never pins stale values, because no frames
 * exist yet); cleared explicitly when the buffer is cleared or the draft is
 * archived.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CURRENT_SEASON } from '@/constants';
import { LeagueId } from '@/platforms/common';
import type { SimulatorPlayer } from './useSimulatorData';

interface PinnedPool {
    pinnedAt: string;
    players: SimulatorPlayer[];
}

const storageKey = (leagueId: LeagueId) =>
    `draftBuilder.pinnedPool.${leagueId}.${CURRENT_SEASON}`;

function readPin(leagueId: LeagueId): PinnedPool | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(storageKey(leagueId));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as PinnedPool;
        if (!Array.isArray(parsed.players) || parsed.players.length === 0) return null;
        return parsed;
    } catch {
        return null;
    }
}

export function usePinnedDraftPool(
    leagueId: LeagueId,
    livePool: SimulatorPlayer[] | undefined,
    draftActive: boolean
): { pool: SimulatorPlayer[] | undefined; pinnedAt: string | null; clearPin: () => void } {
    const [pin, setPin] = useState<PinnedPool | null>(() => readPin(leagueId));
    // Armed on a rising edge of draftActive (frames appearing), disarmed once
    // pinned or explicitly cleared. Edge-triggering (not level) means a
    // clearPin mid-draft doesn't instantly re-pin the by-then-drifted pool —
    // the buffer has to empty and fill again first.
    const armedRef = useRef(false);
    const prevActiveRef = useRef(false);

    // League switches re-read the stored pin for the new key.
    useEffect(() => {
        setPin(readPin(leagueId));
        armedRef.current = false;
        prevActiveRef.current = false;
    }, [leagueId]);

    useEffect(() => {
        if (draftActive && !prevActiveRef.current) armedRef.current = true;
        prevActiveRef.current = draftActive;
        if (!armedRef.current || pin || !draftActive || !livePool || livePool.length === 0) return;
        armedRef.current = false;
        const fresh: PinnedPool = { pinnedAt: new Date().toISOString(), players: livePool };
        try {
            window.localStorage.setItem(storageKey(leagueId), JSON.stringify(fresh));
        } catch {
            // Quota/private-mode failures degrade to in-memory pinning only.
        }
        setPin(fresh);
    }, [pin, draftActive, livePool, leagueId]);

    const clearPin = useCallback(() => {
        try {
            window.localStorage.removeItem(storageKey(leagueId));
        } catch {
            // Already degraded to in-memory; state reset below still applies.
        }
        armedRef.current = false;
        setPin(null);
    }, [leagueId]);

    return useMemo(
        () => ({ pool: pin?.players ?? livePool, pinnedAt: pin?.pinnedAt ?? null, clearPin }),
        [pin, livePool, clearPin]
    );
}
