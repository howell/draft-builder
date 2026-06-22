import {
  CUSTOM_MULTIPLIER,
  STANDARD_MULTIPLIER,
  defaultPriceMultiplier,
  effectiveMultiplier,
  isStandardLeague,
} from '../leaguePriceMultiplier';
import type { LeagueInfo } from '@/platforms/PlatformApi';

function leagueInfo(auctionBudget: number): LeagueInfo {
  return {
    name: 'Test League',
    drafted: false,
    scoringType: 'ppr',
    draft: { type: 'auction', auctionBudget },
    rosterSettings: { QB: 1, RB: 2, WR: 2, TE: 1 },
  };
}

describe('leaguePriceMultiplier', () => {
  describe('isStandardLeague', () => {
    it('treats a $200 auction budget as standard', () => {
      expect(isStandardLeague(leagueInfo(200))).toBe(true);
    });

    it('treats a non-$200 budget as custom', () => {
      expect(isStandardLeague(leagueInfo(240))).toBe(false);
      expect(isStandardLeague(leagueInfo(100))).toBe(false);
    });

    it('treats missing info as custom', () => {
      expect(isStandardLeague(undefined)).toBe(false);
    });
  });

  describe('defaultPriceMultiplier', () => {
    it('returns 1.0 for a standard league', () => {
      expect(defaultPriceMultiplier(leagueInfo(200))).toBe(STANDARD_MULTIPLIER);
    });

    it('returns 4/3 for a custom-budget league (e.g. 12-team/$240)', () => {
      expect(defaultPriceMultiplier(leagueInfo(240))).toBe(CUSTOM_MULTIPLIER);
    });

    it('returns the custom default when league info is unavailable', () => {
      expect(defaultPriceMultiplier(undefined)).toBe(CUSTOM_MULTIPLIER);
    });
  });

  describe('effectiveMultiplier', () => {
    it('uses the stored override when present', () => {
      expect(effectiveMultiplier(1.25, leagueInfo(200))).toBe(1.25);
    });

    it('falls back to the computed default when unset', () => {
      expect(effectiveMultiplier(undefined, leagueInfo(200))).toBe(STANDARD_MULTIPLIER);
      expect(effectiveMultiplier(undefined, leagueInfo(240))).toBe(CUSTOM_MULTIPLIER);
    });
  });
});
