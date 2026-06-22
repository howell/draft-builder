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
 * the account settings page). These helpers only provide the best-effort default
 * and resolve the effective value; nothing yet applies the multiplier to prices.
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
