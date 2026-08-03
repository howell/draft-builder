/**
 * The pinned pool must capture draft-start values exactly once, keep serving
 * them while the live pool drifts (ESPN zeroes its sticker basis right after
 * a draft), survive a reload via localStorage, and release on explicit clear.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { usePinnedDraftPool } from '../usePinnedDraftPool';
import type { SimulatorPlayer } from '../useSimulatorData';

const poolA: SimulatorPlayer[] = [
    { id: '1', name: 'Alpha', defaultPosition: 'QB', positionRank: 0, overallRank: 0, platformValue: 61 },
];
const poolB: SimulatorPlayer[] = [
    { id: '1', name: 'Alpha', defaultPosition: 'QB', positionRank: 0, overallRank: 36, platformValue: 0 },
];

let latest: ReturnType<typeof usePinnedDraftPool>;
function Harness({ pool, active }: { pool: SimulatorPlayer[] | undefined; active: boolean }) {
    latest = usePinnedDraftPool('999001', pool, active);
    return <span data-testid="pinned">{latest.pinnedAt ?? 'none'}</span>;
}

beforeEach(() => window.localStorage.clear());

describe('usePinnedDraftPool', () => {
    it('serves the live pool untouched before the draft goes live', () => {
        render(<Harness pool={poolA} active={false} />);
        expect(latest.pool).toBe(poolA);
        expect(latest.pinnedAt).toBeNull();
        expect(window.localStorage.length).toBe(0);
    });

    it('pins when frames arrive and keeps the pin as the live pool drifts', () => {
        const view = render(<Harness pool={poolA} active={true} />);
        expect(screen.getByTestId('pinned').textContent).not.toBe('none');

        // ESPN zeroes values / refetch replaces the pool: the pin must hold.
        view.rerender(<Harness pool={poolB} active={true} />);
        expect(latest.pool).toEqual(poolA);
        expect(latest.pool![0].platformValue).toBe(61);
    });

    it('restores the pin from localStorage on remount (page reload)', () => {
        const view = render(<Harness pool={poolA} active={true} />);
        const pinnedAt = latest.pinnedAt;
        view.unmount();

        render(<Harness pool={poolB} active={true} />);
        expect(latest.pool).toEqual(poolA);
        expect(latest.pinnedAt).toBe(pinnedAt);
    });

    it('clearPin releases to the live pool and does not re-pin mid-draft', () => {
        const view = render(<Harness pool={poolA} active={true} />);
        act(() => latest.clearPin());
        // Still active: edge-triggered arming must NOT immediately re-pin the
        // drifted pool.
        view.rerender(<Harness pool={poolB} active={true} />);
        expect(latest.pool).toBe(poolB);
        expect(latest.pinnedAt).toBeNull();
        expect(window.localStorage.length).toBe(0);

        // A fresh draft (buffer empties, frames return) re-arms and pins.
        view.rerender(<Harness pool={poolB} active={false} />);
        view.rerender(<Harness pool={poolB} active={true} />);
        expect(latest.pinnedAt).not.toBeNull();
    });

    it('never pins an empty pool', () => {
        render(<Harness pool={[]} active={true} />);
        expect(latest.pinnedAt).toBeNull();
        expect(window.localStorage.length).toBe(0);
    });
});
