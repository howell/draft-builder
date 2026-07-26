/**
 * Roster-slot normalization for the simulator: bench slots must survive
 * (they're drafted with real money — stripping them made the inflation
 * identity's demand end ~90 picks early and blow up mid-draft prices);
 * IR is not drafted and must go.
 */

import { draftableRosterSlots } from '../useSimulatorData';

describe('draftableRosterSlots', () => {
    it('keeps bench slots and drops IR', () => {
        const slots = draftableRosterSlots({
            QB: 1,
            RB: 2,
            WR: 2,
            TE: 1,
            'RB/WR/TE': 1,
            'D/ST': 1,
            K: 1,
            BN: 7,
            IR: 2,
        });

        expect(slots).toEqual({
            QB: 1,
            RB: 2,
            WR: 2,
            TE: 1,
            'RB/WR/TE': 1,
            'D/ST': 1,
            K: 1,
            BN: 7,
        });
    });

    it('handles missing settings', () => {
        expect(draftableRosterSlots(undefined)).toEqual({});
    });
});
