import type { LeagueInfo } from '@/platforms/PlatformApi';

/**
 * Per-league ESPN price multiplier.
 *
 * ESPN's draft room shows "suggested" auction prices that are its published
 * editorial auction values scaled by a single league-wide constant:
 *   suggested = floor(editorial auctionValue × c)
 * (see design-docs/features/live-draft/implementation-plan.md, "Platform value
 * persistence"). ESPN's editorial baseline is a 10-team / $200 budget league, so
 * leagues that keep those defaults need no scaling (c = 1.0), while leagues with
 * custom settings need a constant > 1 — empirically 4/3 ≈ 1.333 for Sam's
 * 12-team / $240 league.
 *
 * The exact constant is league-specific and not derivable from a clean formula,
 * so we store an explicit per-league value the user can view and override (see
 * the account settings page). These helpers provide the best-effort default and
 * resolve the effective value; the live-draft simulator's "Platform (sticker)"
 * benchmark applies it to published platform values.
 */

/** ESPN's editorial baseline auction budget (10-team / $200 league). */
export const ESPN_BASELINE_AUCTION_BUDGET = 200;

/** Default for a league that keeps ESPN's standard settings — no scaling. */
export const STANDARD_MULTIPLIER = 1;

/** Best-effort default for a league with custom settings. */
export const CUSTOM_MULTIPLIER = 4 / 3;

/**
 * Whether a league looks "standard" (keeps ESPN's editorial-baseline settings).
 *
 * Best-effort guess keyed off the auction budget, which is reliably present on
 * `LeagueInfo` (team count is not). A $200 auction budget is treated as standard;
 * anything else (including a non-auction draft with no budget) is treated as
 * custom. Easily tunable as we learn more about how ESPN scales other settings.
 */
export function isStandardLeague(info: LeagueInfo | undefined): boolean {
  return info?.draft?.auctionBudget === ESPN_BASELINE_AUCTION_BUDGET;
}

/**
 * Best-effort default multiplier for a league: 1.0 for standard leagues, 4/3 for
 * leagues with custom settings.
 */
export function defaultPriceMultiplier(info: LeagueInfo | undefined): number {
  return isStandardLeague(info) ? STANDARD_MULTIPLIER : CUSTOM_MULTIPLIER;
}

/**
 * The multiplier to use for a league: the stored override when set, otherwise the
 * computed default. A league re-classified later keeps tracking its default until
 * the user explicitly overrides it.
 */
export function effectiveMultiplier(stored: number | undefined, info: LeagueInfo | undefined): number {
  return stored ?? defaultPriceMultiplier(info);
}

/** Format a multiplier for display, trimming trailing zeros (e.g. 1.3333, 1, 1.2). */
export function formatMultiplier(value: number): string {
  return parseFloat(value.toFixed(4)).toString();
}

/**
 * Validate a raw multiplier input string. Returns the parsed positive number, or a
 * user-facing error message for blank/non-numeric/non-positive input.
 */
export function parseMultiplierInput(raw: string): { value: number } | { error: string } {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { error: 'Enter a positive number' };
  }
  return { value: parsed };
}
