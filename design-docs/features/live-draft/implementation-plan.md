# Live Draft Price Tracking Implementation Plan

> **2026-06 Modeling Reboot — read this first.**
>
> The original plan below (an 8-feature multiple linear regression predicting
> price-as-%-of-budget) is **retained for comparison only**. Auction prices are
> heavily skewed, a linear fit handles that poorly and can imply negative prices
> late, and the "baseline convergence" behaviour was a hack to fake the
> exponential shape. The live feature now centers on a deterministic
> **inflation-decomposition** model, with the regression kept as a comparison
> baseline so the better model can be chosen empirically.
>
> ### Inflation-decomposition model (`src/lib/models/live-draft/inflationModel.ts`)
>
> ```
> price(player) = 1 + (baseValue(player) - 1) × inflation(position, state)
>
> globalInflation = (money left to spend - $1 reserve per open slot)
>                   --------------------------------------------------
>                   (Σ surplus value of players still to be drafted)
> ```
>
> - `baseValue` reuses the exponential baseline (`predictPrice` in
>   `src/app/league/analytics.ts`); "players still to be drafted" = the top
>   undrafted players capped at the league's **remaining capacity per position**
>   (lineup-slot keys that match no real position act as shared flex capacity).
>   Without the positional cap, a deep position (QBs in a 1-QB league) would
>   contribute surplus value no roster can absorb and distort the field.
> - **No training.** Money is conserved by construction (predicted prices over
>   remaining draftable players sum to remaining money, so the last pick lands at
>   ~$1), and inflation is ~1.0 on an empty board so it degrades to the baseline.
>   The money side excludes **dead money** (teams with full rosters can't spend
>   what they have left) and, optionally, the league's historical
>   **expected-unspent** (money this room habitually leaves on the table was
>   never going to chase players).
> - **Positional inflation = soft team appetite.** Investment pressure compares
>   the actual spend share per position against the **baseline-expected spend
>   share over the same drafted players** (✅ 2026-06 fix: comparing against the
>   *remaining board's* value share manufactured pressure from draft order alone
>   — RBs drafted early at exactly fair prices looked "over-invested"; the
>   neutral-market unit test pins this). Over-invested positions get a dampened
>   appetite, allocations renormalize so money stays conserved, and the appetite
>   exponent is clamped so a thin board can't blow it up. A single `elasticity`
>   knob (0 = global) is **calibrated, not guessed** (see `calibrate.ts`). Teams
>   still bid above $1 on positions they already filled — the model only makes
>   heavy further spend *less likely*, never impossible. (Known limit: the
>   pressure signal is league-aggregate and cross-positional; per-*team* appetite
>   is a possible future refinement.)
>
> ### League-history signals (`history.ts`, all optional knobs, all backtest-gated)
> - **Pooled baselines**: `createPooledBaselineModels` fits the exponential
>   curves on every season at once, on a shared within-draft rank axis. This also
>   makes per-position curves viable; `baselineValue(…, positional)` evaluates a
>   player on its position's own curve (overall rank confounds position with
>   price — high-ranked QBs go cheap in 1-QB leagues).
> - **Positional priors**: `computePositionalPriors` measures this league's
>   historical per-position premium/discount vs the baseline; the model applies
>   it at full strength on an empty board, decaying toward the live appetite
>   signal as real money is spent. Positional factors no longer start pinned at
>   1.0 on pick 1.
> - **Expected unspent**: `averageUnspent` measures money the league leaves on
>   the table at the end of a draft, subtracted from the spendable-money side of
>   the identity (max'd with realized dead money, not double-counted).
> - Historical drafts are normalized with **stored platform values** when
>   available (see "Platform value persistence" below), falling back to
>   price-derived ranks for unmatched players or seasons without data. With
>   real preseason ranks/values, the backtest tests models against the same
>   platform inputs a live draft room shows; the price-derived fallback
>   flatters absolute baseline accuracy but preserves mid-draft dynamics.
>
> ### Platform value persistence (2026-06)
> ESPN's preseason editorial values are scraped into our own
> `platform_player_values` table (migration 003; global reference data,
> world-readable RLS, service-role writes) so backtests never depend on ESPN
> availability:
> - **Sources**: draft-kit cheat-sheet PDFs (frozen preseason artifacts; live
>   CDN 2023+, Wayback 2019-2022; raw PDFs archived under
>   `data/espn-draft-kits/`) parsed by `src/platforms/espn/draftKit.ts`, plus
>   dated API snapshots for the current season only — the API's archived ranks
>   drift in-season (verified: 2023 stored Kelce at rank 37/$22 vs his ~$44+
>   preseason kit value), so only pre-draft snapshots are trustworthy.
> - **Ingest**: `npm run ingest:espn-values -- --backfill 2019:2025 --current`
>   (`scripts/ingest-espn-values.ts`); name→ESPN-id resolution against the
>   season's player list. Periodic intake via the
>   `.github/workflows/ingest-espn-values.yml` cron (weekly; daily Jul-Sep;
>   needs `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` repo secrets).
> - **Read path**: `/api/player-values` route + `usePlayerValuesQuery`;
>   `useSimulatorData` feeds the lookup into `normalizeHistoricalDraft`.
> - **Draft-room formula** (verified empirically on Sam's league): suggested
>   price = `floor(editorial auctionValue × c)` with one league-wide constant
>   (4/3 for a 12-team/$240 league). Superflex, scoring nuances, and roster
>   quirks are NOT reflected; K/DST are always $0 — the gap between platform
>   values and actual prices is exactly the league behavior the model learns.
> - **Per-league multiplier setting** (`c`): persisted per league as a user-level
>   account setting (`user_settings` table, migration 005; key
>   `app/leaguePriceMultipliers` → `{ [leagueId]: number }`), exposed through
>   `StorageAdapter.get/setUserSetting`, the `useLeaguePriceMultipliers` hooks,
>   and the `/settings` account page (`src/app/settings/`). The best-effort
>   default lives in `src/lib/leaguePriceMultiplier.ts`: `1.0` for a standard
>   (ESPN-baseline `$200`) league, `4/3` otherwise. **Stored/viewable/overridable
>   only** until 2026-07-26, when the simulator's "Platform (sticker)" benchmark
>   became its first consumer: `useSimulatorData` resolves the effective
>   multiplier and `StickerPredictor` reconstructs the number the draft room
>   displays, as an explorer column and backtest row alongside the
>   money-conserving "Platform (rescaled)" model. Scaling depends on the value
>   source: the multiplier applies only to ESPN's *published universal* values
>   (the stored draft-kit/API snapshots used in the backtest) — the
>   league-scoped API's `draftAuctionValue` (the live explorer pool) already
>   has it applied, so the explorer passes multiplier 1 or the sticker would
>   double-scale.
> - **`PlatformValuePredictor`** (`createPlatformValuePredictor`): the same
>   money-conserving identity with `valueSource: 'platform'` — "just trust the
>   platform's prices" as a backtest column the inflation model must beat.
>
> ### Supporting modules
> - `predictor.ts` — unified `PricePredictor` interface; `BaselinePredictor`,
>   `InflationPredictor`, `RegressionPredictor` all implement it so the UI and
>   backtest treat them interchangeably. `PredictionContext` carries the league's
>   `rosterNeeds`. Fixed 2026-07-26: the legacy regression's scarcity features
>   divided by the 0-indexed rank (0/0 = NaN for every draft's top player),
>   which poisoned the trained weights and rendered "$NaN" in the explorer's
>   Regression column. `featureExtraction.ts` now divides by rank + 1, training
>   skips non-finite rows, and `RegressionPredictor` routes non-finite
>   predictions to the baseline fallback (`__tests__/predictor.test.ts`).
> - `draftSimulator.ts` — seeded generative simulator: teams nominate and win
>   players at a predictor's price + noise, respecting budgets/slots/$1 minimums.
>   Produces plausible mid-draft states and validates a model (full draft should
>   fill every roster and respect every budget).
> - `backtest.ts` — replays historical drafts pick-by-pick and reports
>   MAE/MAPE/bias per model, by phase and position. `backtestHeldOut` runs
>   **leave-one-out**: each draft is scored with a baseline (and priors/unspent)
>   fit on the *other* drafts, so calibration can't memorize the test data; a
>   single-draft league falls back to in-sample and the report says so.
> - `calibrate.ts` — `calibrateElasticity` grid-searches elasticity by held-out
>   MAE in one pass (one predictor per grid point), honoring the knob toggles.
>
> ### Game-day board (2026-07-27 split)
> `/league/[leagueID]/live-draft` is now the **read-only game-day page**
> (`LiveDraftBoard.tsx`): ingested draft-room frames (2s poll via
> `useLiveDraftFramesQuery`) are folded into board state by
> `src/lib/models/live-draft/liveBoard.ts` — INIT **snapshot-replaces** the
> pick ledger (official numbers win; a fresh draft's INIT wipes stale
> rehearsal captures), SOLD updates it, pool-miss picks get fallback players
> so budgets stay honest, and the unsold tail lot of the last capture becomes
> the "On the clock" callout (current bid vs the calibrated model's price).
> Team names come from `useLeagueTeamsQuery`; model settings come from the
> per-league knobs persisted by the simulator's "Calibrate model"
> (`useLeagueModelKnobs`, setting key 'leagueModelKnobs', including the
> CalibrationConfig they were tuned under) — absent knobs fall back to the
> plain identity (e=0, w=1) with an "uncalibrated" badge. The simulator moved
> to `/live-draft/simulator` (sidebar sub-link); manual pick entry stays there
> as the tap-failure fallback. Shared render pieces live in
> `components/board/` (StatTiles, PicksTable, PositionalInflationCard,
> PredictionExplorer, CurrentLotCard). `parseInitBlob` is Buffer-free
> (DataView/atob) so the decoder runs client-side. Tests:
> `__tests__/liveBoard.test.ts` (snapshot-replace, reconnect merge,
> stale-capture reset, pool-miss, in-progress lot, retry ordering),
> `__tests__/LiveDraftBoard.test.tsx`, `useLeagueModelKnobs.test.tsx`.
>
> ### Draft archives (2026-07-29) ✅ COMPLETED
>
> The ingest buffer (`live_draft_frames`) is a hot buffer, not an archive:
> frames pile into one `(user, league)` bucket with no draft identity, and
> the board is only correct because INIT snapshot-replaces the ledger. The
> archive feature (migration `008_live_draft_archives.sql`) adds durable,
> named, per-draft persistence — raw frames plus parsed picks **and
> bid-level events** for SQL analysis of auction dynamics (the
> appetite/inflation modeling corpus).
>
> - **Schema** (all browser-writable under direct-ownership RLS, explicit
>   grants per the migration-004 gotcha): `live_draft_archives` (header:
>   name, kind `real|test`, season, `status pending|complete`, counts),
>   `live_draft_archive_frames` (raw copy; `source_frame_id` preserves the
>   live fold order), `live_draft_archive_picks` (denormalized
>   player_name/position so archives outlive pool availability; lot
>   enrichment: nominator, bid counts, sold_at_ms; BIGINT ids — D/ST ids are
>   negative), `live_draft_archive_bids` (one row per `open|bid|pass` event
>   in lot order; unsold lots keep their rows — failed nominations are
>   appetite signal; LEFT JOIN picks on `(archive_id, player_id)`).
> - **Extraction** (`src/lib/models/live-draft/archiveExtract.ts`): picks
>   delegate to `buildLiveBoard`; bids are deduped across captures by
>   per-lot best-capture selection (most bids wins, tie → longest-lived
>   capture) behind a **fresh-draft epoch guard** — only an INIT that parses
>   to an *empty* ledger advances the epoch, so rehearsal bids are excluded
>   but pre-reconnect bids survive a mid-draft INIT (the originally planned
>   "any INIT" guard would have dropped them). Residual gap: rehearsal
>   residue + joining the real draft mid-draft (no empty INIT anywhere)
>   can't be separated — covered by clearing the buffer before draft night.
> - **Flow** (`src/lib/live-draft/archive.ts`, client-side under RLS like
>   the frames poll): header `pending` → batch-copy frames (500/insert) →
>   picks → bids → flip `complete` (commit point) → delete buffer
>   `id <= maxFrameId` (watermark-bounded; mid-archive arrivals survive).
>   Failure deletes the header (cascade) and leaves the buffer untouched —
>   always re-runnable; stranded `pending` rows surface in the list UI with
>   a delete action. `useLiveDraftFramesQuery` accumulation moved from a ref
>   into the React Query cache so `resetLiveDraftFrames` genuinely resets a
>   mounted board after archive/clear.
> - **UI**: board actions "Archive draft…" (inline panel: parse preview,
>   name with collision-proof default, real/test toggle defaulting to the
>   league's last-used kind) and "Clear buffer" (test-iteration reset);
>   `/live-draft/archives` list (kind badges, export, delete; sidebar
>   sub-link) and `/live-draft/archives/[archiveId]` read-only board
>   (archived frames replayed through `buildLiveBoard`; falls back to the
>   denormalized pick rows without a pool; no predictors — archives show
>   what happened, not what the model thought). The detail page renders a
>   **Bid history** card (`BidHistory.tsx` + pure `groupBidLots.ts`,
>   2026-07-29): per-lot event chips (open/bid/pass, hammer, duration,
>   distinct bidders), sold lots in pick order then unsold nominations;
>   picks with no observed bidding are reported as an INIT-catch-up count. JSONL export matches the
>   userscript badge format (ts normalized to `Z`) so exports replay via
>   `scripts/replay-frames.ts` and feed the corpus tooling.
> - **Bid-history browsing + full bids fetch (2026-08-02) ✅ COMPLETED**:
>   `fetchArchiveDetail` fetched bids in ONE request, so PostgREST's 1000-row
>   cap silently truncated any real draft (~2k events) — lots beyond the cap
>   (ordered by player_id) were mislabeled INIT catch-up on the archive page.
>   Bids now drain in pages via `fetchArchiveBids` (offset pagination like
>   values; rows immutable), and the card gained controls: player-name
>   search, position/team/outcome filters, and metric sorts
>   (price/events/bidders/duration, descending, unknowns last, draft-order
>   ties) via pure `filterSortLots` on `DisplayLot`s (lot + resolved
>   name/position, so search matches what's rendered). Team filter counts
>   active bids or the win — not passes — mirroring `distinctBidders`.
> - **Tests**: `archiveExtract.test.ts` (dedup, epoch guard, reconnect
>   survival, pass interleaving, unsold lots), `archive.test.ts` (JSONL
>   round-trip; `fetchArchiveBids` page-drain, mapping, short/empty-page
>   stop, error propagation), `groupBidLots.test.ts` (grouping +
>   `filterSortLots` search/filter/sort semantics), `BidHistory.test.tsx`
>   (controls drive the visible lots; INIT summary; empty states),
>   `archive.integration.test.ts` (real local Supabase: grants,
>   WITH CHECK, RLS isolation, watermark survival, unique constraints,
>   cascade, updated_at trigger), extended `LiveDraftBoard.test.tsx`.
> - **Manual E2E loop (test league)**: `npm run dev` → mint token on the
>   live-draft page → `npx tsx scripts/replay-frames.ts --frames
>   draft-captures/<corpus>.frames.jsonl --league <testLeagueId> --token <t>
>   --fresh --delay-ms 250` → board folds picks → Archive draft… (kind=test)
>   → board resets to waiting → verify list row / detail board / `select *
>   from live_draft_archive_bids order by player_id, seq` in Studio →
>   Export JSONL → re-replay the export with `--fresh` → identical board →
>   Clear buffer → delete the test archive. **Before a real draft night:
>   Clear buffer once so the draft starts from an empty buffer.**
>
> ### "My roster" draft planner (2026-07-29) ✅ COMPLETED
>
> The game-day board's in-draft planning tool: my team's real picks locked
> at their real prices, open slots penciled in with remaining players at the
> live inflation estimate ± a user nudge, budget totals updating per poll.
>
> - **Team identity**: `buildLiveBoard` now returns `myTeamId` from the
>   draft room's TOKEN frame (last in fold order wins; receive-dir only),
>   with a manual dropdown override persisted per league.
> - **Reconciliation** (`src/lib/models/live-draft/rosterPlan.ts`, pure,
>   idempotent — unit-tested fixed point): locked picks auto-assign
>   (defaultPosition slot → eligible slot in lineup order → overflow);
>   plan entries are consumed when I draft the player, keep open slots
>   (stability pass), shift when displaced by a lock, or drop with a
>   notice; players drafted by others flag **sniped** (struck-through,
>   excluded from spend, kept until cleared). Budget: locked + planned +
>   $1/unfilled-slot reserve, plus `maxBid = remaining − (openSlots − 1)`.
> - **Persistence**: `user_settings` ('app', 'liveDraftRosterPlans') —
>   `Record<LeagueId, { teamId?, selections: {slotKey: {playerId, delta}} }>`;
>   **deltas only, never prices**, so estimates track the market with zero
>   poll-driven writes; 500ms debounced (`useLeagueRosterPlans` +
>   `hooks/useRosterPlan.ts`).
> - **Pricing**: `priceWithInflationField` extracted from
>   `InflationPredictor.predict` (parity-tested) — planner candidates price
>   O(n) against the board's memoized field and can't drift from the
>   Best-available column.
> - **UI**: `components/board/MyRosterPlanner.tsx` between StatTiles and
>   PicksTable; reuses the mocks page's `MockRosterEntry` for open slots,
>   new `LockedRosterRow`/`SnipedRosterRow`; budget strip visible even
>   collapsed. `SimulatorPlayer` now declares `positions` (runtime always
>   had it via buildPlayerDb).
> - **Tests**: `rosterPlan.test.ts` (14 — assignment cascade, consume,
>   shift/drop/stability, snipe, budget, idempotence),
>   `useLeagueRosterPlans.test.tsx`, extended `liveBoard.test.ts` (TOKEN)
>   and `LiveDraftBoard.test.tsx` (detect/lock, manual-team persist, snipe).
>   E2E-verified against the dress-rehearsal buffer: TOKEN → team 1, Chase
>   + JSN locked at $27, Jeanty planned at estimate+2, reload-restored,
>   then sniped live via a replayed SOLD frame.
>
> **Search/filter addendum (2026-07-30) ✅**: the board's "Best available"
> table gained the mock page's search/filter UX plus click-to-plan —
> `SearchSettings` (positions / count / price range, in a Filters
> collapsible) + a name-search input filter the explorer via the mock
> page's `playerAvailable` (affordability compares the inflation estimate
> against `budget − plan.totalCommitted`; planned/locked players are
> excluded like mock selections). Clicking a row assigns the player to the
> first open eligible plan slot (`firstOpenSlotFor` in rosterPlan.ts) at
> the live estimate. `useRosterPlan` moved up into `LiveDraftBoard` so the
> explorer and `MyRosterPlanner` share one plan; `PredictionExplorer` grew
> optional `onRowClick`/`subHeader` props (simulator unchanged). Filtering
> prices all candidates O(1) via `priceWithInflationField` against the
> memoized field. Also pinned the CI Supabase CLI to 2.107.0 (`latest`
> ≥2.108 collides with the deprecated [inbucket] config on port 54324).
>
> ### UI — simulator
> `src/app/league/[leagueID]/live-draft/page.tsx` is reachable in production via
> the "Live Draft" sidebar link (dev gating removed 2026-07-26 — the site's only
> user is the owner, who wants it available for testing). `DraftSimulator.tsx` +
> `useSimulatorData.ts` load real league data (**all seasons** with draft
> history, not just the latest), generate plausible states, and show a
> side-by-side prediction explorer plus the held-out backtest panel with knob
> toggles and a "Calibrate elasticity" button that applies the best grid point.
> Season toggles (added 2026-07-26, mirroring the mocks page's estimation-years
> setting) filter which historical drafts feed the models: one selection drives
> the re-pooled baseline, priors, expected-unspent, regression training, and the
> backtest/calibration set, so every model compares on the same history. At
> least one season must stay selected; toggling clears stale backtest/calibration
> results (`__tests__/DraftSimulator.seasons.test.tsx`). A "Simulated picks"
> card (added 2026-07-26) lists each generated pick — number, player, position,
> team, price — whenever a randomized state is active
> (`__tests__/DraftSimulator.picks.test.tsx`). In-page help (added 2026-07-26):
> a collapsed "How this page works" guide card (workflow, model descriptions,
> how to read inflation and the backtest metrics) plus tooltips on every knob,
> stat tile, explorer column, and backtest metric; help text lives in
> `components/SimulatorGuide.tsx` (`__tests__/DraftSimulator.guide.test.tsx`).
> Busy/done feedback (added 2026-07-26): backtest and calibration run deferred
> so the buttons can show a spinner (the work is synchronous and would freeze
> the page first), with elapsed-time readouts on completion. Regression
> training is opt-in via a "Train regression" button on the explorer card —
> until pressed (or after seasons/budget/teams change, which discards the
> model) there is no Regression column in the explorer or backtest
> (`__tests__/DraftSimulator.regression.test.tsx`).
> The prediction explorer shows player names (abbreviated to first-initial form
> on narrow screens, CSS-truncated as backstop) alongside rank/position.
> Manual pick entry (2026-07-26): the Picks card accepts hand-entered picks —
> player search (reusing `PlayerSearchInput`/`usePlayerSearch` from the
> deferred live-draft work, whose value-sync/suggestion-state bugs were fixed
> in the process), price prefilled from the inflation model, team select with
> budget guard, Undo — alone or stacked on a randomized state, for what-ifs
> like "the first stars go $20 over" (`__tests__/DraftSimulator.manual.test.tsx`).
> The picks table's "Δ Infl" column attributes global-inflation movement to
> each pick via `computeInflationTimeline` (inflationModel.ts): the board is
> replayed pick-by-pick and the factor differenced — overpays are negative
> (money drains faster than talent), bargains positive. Deltas telescope to
> the total movement by construction.
> Calibrated blend weight (2026-07-26): `blend` (w) in `InflationModelOptions`
> shrinks the inflation factor toward neutral — price = 1 + surplus ×
> (1 + w·(inflation − 1)); w=0 is the baseline, w=1 the full identity (which
> no longer conserves money at w<1, deliberately). "Calibrate model" runs a
> coordinate sweep (elasticity at w=1, then w at the winning elasticity, each
> a single multi-predictor backtest pass) and applies both. Motivated by the
> 2026-07-26 backtest sweeps: elasticity calibrated to 0 on every consecutive
> season window, and full-blend inflation only beat the baseline with all 7
> starred seasons ($4.03 vs $4.10 MAE) while losing on short windows — the
> optimal w is data-dependent, so it's measured.
> Demand-accounting fix (2026-07-26): bench slots are no longer stripped from
> `rosterNeeds` (only IR is) — with starters-only demand the inflation
> identity's open slots hit zero ~90 picks before real drafts ended, piling
> all remaining money onto a vanishing draftable set (backtest bias +$10/pick,
> MAPE 269%). Bench keys count as flex capacity in `remainingCapacity`. The
> backtest table now shows Early/Mid/Late MAE so phase-local failures like
> this are visible.
>
> Tests: `__tests__/inflationModel.test.ts` (conservation — including from
> platform values, neutral-market no-pressure invariant, over/under-spend
> direction, positional capacity caps, dead money, priors, expected-unspent),
> `__tests__/history.test.ts` (normalization incl. stored platform values,
> pooled baselines, priors/unspent measurement, leave-one-out backtest,
> calibration), `__tests__/draftSimulator.test.ts` (roster/budget/minimum
> invariants, determinism) and `src/platforms/espn/__tests__/draftKit.test.ts`
> (cheat-sheet parsing against real 2023 sheet fixtures: column interleaving,
> value/bye digit-run repair, D/ST matchup rows).
>
> ### Deferred modeling ideas
> - **γ value-concentration knob** (allocate money ∝ surplus^γ to capture
>   stars-and-scrubs vs balanced rooms) — only worth trying if priors/unspent
>   leave bias on the table in the held-out backtest.
> - **Per-team appetite** (which *teams* are invested in a position, not just
>   the league aggregate) — needs more signal than league-level shares.
>
> ### Game-day layout overhaul (2026-07-31) ✅
>
> Driven by a real practice-draft session's print: the board stacked
> everything in one column, so the two mid-draft workhorses (my roster,
> best available) were never on screen together and three full-height stat
> cards + 13 empty slot inputs ate page one.
> - **StatusBand** (`components/board/StatusBand.tsx`): sticky strip
>   replacing StatTiles + CurrentLotCard on the board — on-the-clock lot
>   (keeps `current-lot`/`lot-gap` testids), picks, spent/total, global
>   inflation, my remaining + max bid. Always visible while scrolling.
>   CurrentLotCard deleted (board was its only consumer); StatTiles and
>   PositionalInflationCard remain for the simulator/archive pages.
> - **Two-column desktop** (`lg:grid-cols-2`, container widened to
>   `max-w-screen-2xl`): planner + picks card left, Best available right
>   with internal scroll + sticky table header (`PredictionExplorer`
>   `scrollBody` prop; simulator unaffected). Positional-inflation chips
>   moved into the Best-available filters area
>   (`positional-inflation-chips`); archive/clear actions merged into the
>   page header.
> - **Planner bench collapse**: >1 empty Bench slots render as one
>   "N open slots · $N reserved" row (`bench-collapsed` testid) with
>   plan-bench…/hide toggles.
> - **IngestSetup auto-collapse**: once frames flow, the setup card
>   collapses to a "✓ receiving · N frames" status line with a setup
>   expander (open by default only while quiet).
> - **Width tuning (measured at 1024/1280/1512, zero overflow at all
>   three)**: asymmetric `lg:grid-cols-5` split (planner 2fr, explorer
>   3fr); explorer abbreviates headers (Base/Sticker/Infl via
>   `SHORT_LABELS`) and player names (`shortPlayerName`, full name in
>   `title`) in `scrollBody` mode; PicksTable `hideDeltaBelowXl` prop hides
>   the Δ Infl column below xl in the board's narrow column (sim/mocks
>   unaffected); the MockRosterEntry +/- stepper went from a vertical
>   stack to inline `- $x +`, cutting every roster row's height (mocks
>   page benefits too). Lesson recorded: `truncate` inside auto-layout
>   table cells RAISES intrinsic width (nowrap) — don't truncate there.
> - **Userscript v0.5**: the badge now *derives* its state from the current
>   socket's readyState every 2s instead of latching lifecycle events —
>   ESPN churns draft-room sockets mid-session, and the old badge showed
>   "(closed)" (sticky amber) after any reconnect. Blue = recording (with a
>   ⇋N reconnect marker), amber = the current socket really is closed,
>   red = ingest rejected a batch (clears on the next successful flush).
>
> ### Picks trend tracker (2026-07-31) ✅
>
> The board's Picks card now answers "what did that pick go for vs the
> model, and what's the positional trend?":
> - `computeInflationTimeline` emits `modelPrice` per pick — the player's
>   field-priced value **as of when they were on the block** (the post-pick
>   field of step k−1 is the pre-pick field of step k, so this costs zero
>   extra computeInflation calls). At-the-time model, not static baseline:
>   in an inflationary room everything beats baseline, so paid−model-now is
>   the actionable residual (parity-tested vs InflationPredictor).
> - PicksTable gains Model and signed ± (paid−model) columns via the
>   `modelPrices` prop; the `compact` prop (board only) tiers columns by
>   viewport: ± always, #/Model from xl, Δ Infl from 2xl — width-measured
>   zero overflow at 1024/1280/1512.
> - Position filter chips + a trend summary line in the Picks card:
>   "5 picks · $105 spent · avg −$10.8 vs model" for the selected position.
>   Retroactive model prices use the current calibration knobs; a team
>   filter would ride the same mechanism (see rival-intel backlog).
> - **Δ Infl restored at all widths (2026-07-31 follow-up)**: in compact
>   mode the column renders tersely (`+.03×` via `formatDeltaTerse`, full
>   precision in the cell title) and the Pos badge merges into the Player
>   cell to pay for the width — zero overflow re-measured at
>   1024/1280/1512. Sim/mocks keep the verbose separate-column form.
>
> ### Practice-draft support (2026-07-31) ✅
>
> ESPN "practice drafts" reuse the real draft-room UI but run in a
> **throwaway lobby league** (e.g. socket `league-1665107216` while the
> page is league 781060), which broke ingest-to-board matching two ways:
> the userscript labeled frames with the lobby id (board polls the real
> id → nothing appears), and INIT ledger records begin with the lobby id
> (locator keyed on the page league finds no ledger). Fixes:
> - Userscript v0.4: `localStorage.draftBuilderLeagueId` overrides the
>   socket-URL scrape (validated `^\d{1,32}$`); the IngestSetup console
>   snippet now sets it per league, so re-pasting the snippet each draft
>   pins frames correctly with no extra steps.
> - `buildLiveBoard` and `extractArchive` parse INIT with the **room's**
>   league id from the TOKEN frame (fallback: config.leagueId) — a no-op
>   on real draft night where the ids match. Tests: practice-lobby INIT
>   catch-up in `liveBoard.test.ts`, lobby-INIT epoch guard in
>   `archiveExtract.test.ts`; E2E-verified via a synthetic lobby capture
>   replayed through ingest (INIT picks + live SOLD render on the board).
> - **Blob encoding fix (2026-07-31, live-debugged against a real practice
>   session)**: current ESPN INIT blobs interleave `#` characters into the
>   base64 stream (2,048 in one observed 26KB blob) — `atob` throws on the
>   first one, so `parseInitBlob` returned null and the board silently ran
>   SOLD-only (missing catch-up picks, wrong spent/best-available).
>   `base64ToBytes` now strips non-base64 characters before decoding
>   (matching `Buffer.from` semantics; cross-validated — the decoded
>   ledger's 58 completed picks matched the room's SOLD frames, and the
>   record layout is unchanged: 45 bytes, league id first). Note the room
>   also emits new verbs `AUTO_NOMINATION`/`NOMINATE`, which fall through
>   to `{type:'unknown'}` harmlessly.
>
> ### 2026-07 Live data acquisition — test-draft findings ✅
>
> **Full reference: [espn-draft-room-protocol.md](espn-draft-room-protocol.md)**
> (wire protocol grammar, INIT blob layout, tooling, draft-day workflow, and
> the remaining integration work). Summary:
>
> A 4-team test-league auction (2026-07-19) settled how live draft data can be
> acquired from ESPN:
>
> - **REST is completion-only.** `mDraftDetail` pre-creates the pick skeleton
>   (playerId -1), freezes for the whole draft, and flushes all picks atomically
>   at completion. Polling (`scripts/poll-draft.ts`) is therefore post-draft
>   reconciliation/corpus capture only — the live integration must tap the
>   **draft-room WebSocket** (`wss://fantasydraft.espn.com/game-1/league-<id>/JOIN`),
>   whose plain-text protocol streams every NOMINATION, individual BID (with
>   bidder identity — the per-team appetite signal above), CLOCK tick, and SOLD.
> - **Decoder implemented**: `src/platforms/espn/liveDraftProtocol.ts`
>   (`parseDraftSocketFrame`, `reconstructLots`), jest-tested with real frames;
>   `scripts/parse-draft-har.ts` converts a DevTools HAR export into
>   events.jsonl + lots.json and cross-validates against the REST flush
>   (price + winner: 51/51; REST `nominatingTeamId` is the pre-assigned
>   schedule, not actual nominators — WS is ground truth late-draft).
> - **INIT blob decoded ✅** (`parseInitBlob`): a 45-byte-record pick ledger —
>   completed picks (player+team+price validated 13/13 vs REST) plus pending
>   slots with the scheduled nominating team. This is the mid-draft connect
>   catch-up state. The slot field is provisional (`slotIdHint`); the rest of
>   the blob (timestamps, budgets?) remains undecoded but isn't needed.
> - **Draft-room tap userscript ✅** (`scripts/espn-draft-room-tap.user.js`,
>   Tampermonkey): patches WebSocket at document-start, records frames on
>   fantasydraft.espn.com sockets, floating badge → JSONL download, optional
>   2s-batch POST forwarding to a Draft Builder ingest URL (set
>   `localStorage.draftBuilderIngestUrl` in the draft-room tab). Tap captures
>   parse via `parse-draft-har.ts --frames` (verified identical lots vs HAR).
> - **Open items**: identify SOLD field 3; build the app-side ingest endpoint +
>   live-draft page consumption of the stream (wire into the inflation model);
>   dry-run the userscript in a future test draft. Raw captures live in
>   `draft-captures/` (gitignored).
>
> ---

## Overview

A real-time draft tracking interface that allows users to enter draft picks as they happen and receive updated price predictions based on current spending patterns and roster needs.

## Feature Requirements

### Core Functionality
- **Draft Pick Entry**: Enter player, price, and drafting team for each pick
- **Pick Management**: Edit/undo previously entered picks
- **Dynamic Pricing**: Real-time price predictions updated based on current draft state
- **Player Search**: Type-ahead search for player selection (like MockTable)
- **Spending Analysis**: Track spending trends by position and team
- **Roster Tracking**: Monitor unfilled starting positions across all teams

### Integration Points
- Reuse `PlayerTable.tsx` for displaying available players
- Integrate `EstimationSettings.tsx` for baseline price estimation
- Utilize `SearchSettings.tsx` for player filtering
- Leverage existing player search patterns from `MockTable.tsx`

## UI Mockup

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Live Draft Tracker                                │
├─────────────────────────────────────────────────────────────────────────────┤
│ Draft Setup                                     │ Quick Actions              │
│ League: My League 2024                         │ [Undo Last Pick]           │
│ Teams: 12  Budget: $200  Roster: 15           │ [Export Draft]              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              Enter Pick                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│ Pick #: [23]     Team: [Team 3 ▼]                                         │
│ Player: [Josh Jacobs_____________] [Search Results Dropdown]                │
│ Price: [$42]                          [Add Pick] [Clear]                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ Current Draft State                                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ Pick | Team    | Player           | Pos | Price | Predicted | Diff        │
│ 22   | Team 1  | Christian McCaff | RB  | $65   | $62       | +$3        │
│ 21   | Team 12 | Tyreek Hill      | WR  | $55   | $58       | -$3        │
│ 20   | Team 11 | Josh Allen       | QB  | $45   | $42       | +$3        │
│ ...  | ...     | ...              | ... | ...   | ...       | ...        │
│                                        [Edit] [Delete] buttons per row      │
└─────────────────────────────────────────────────────────────────────────────┘

┌───────────────────────────────────┬─────────────────────────────────────────┐
│            Spending Trends        │           Roster Analysis               │
├───────────────────────────────────┼─────────────────────────────────────────┤
│ Position Spending vs Predicted:   │ Unfilled Starting Positions:           │
│ QB: $42 avg (pred: $40) +5%       │ QB: 8/12 teams (4 still need)          │
│ RB: $48 avg (pred: $45) +7%       │ RB: 18/24 spots (6 still need)         │
│ WR: $52 avg (pred: $50) +4%       │ WR: 20/36 spots (16 still need)        │
│ TE: $25 avg (pred: $28) -11%      │ TE: 5/12 teams (7 still need)          │
│                                   │ K: 2/12 teams (10 still need)          │
│ Overall Inflation: +4.2%          │ DEF: 1/12 teams (11 still need)        │
│ Premium Positions: +6.1%          │                                         │
│ Utility Positions: -2.3%          │ Budget Status:                          │
│                                   │ Avg Remaining: $127/team               │
│                                   │ Highest: $165 (Team 8)                 │
│                                   │ Lowest: $95 (Team 3)                   │
└───────────────────────────────────┴─────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         Available Players                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ [Estimation Settings ▼] [Search Settings ▼]                               │
│                                                                            │
│ Player Table (reusing existing PlayerTable.tsx):                          │
│ Player           | Pos | Predicted | Baseline | Trend | Likelihood        │
│ Saquon Barkley   | RB  | $48      | $45      | +7%   | High (8 need RB)  │
│ CeeDee Lamb      | WR  | $51      | $49      | +4%   | Medium             │
│ Travis Kelce     | TE  | $35      | $38      | -8%   | High (7 need TE)  │
│ ...              | ... | ...      | ...      | ...   | ...               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Architecture

### Core Data Types

```typescript
interface LiveDraftPick {
  pickNumber: number;
  teamId: string;
  teamName: string;
  player: RankedPlayer;
  price: number;
  timestamp: Date;
}

interface LiveDraftState {
  leagueId: LeagueId;
  draftId: string;
  picks: LiveDraftPick[];
  teams: DraftTeam[];
  currentPickNumber: number;
  settings: LiveDraftSettings;
  stateSnapshot: DraftStateSnapshot; // current draft context
}

interface DraftTeam {
  id: string;
  name: string;
  budget: number;
  remainingBudget: number;
  rosterSlots: RosterSlot[];
  filledPositions: Map<string, number>; // position -> count
}

interface LiveDraftSettings {
  totalBudget: number;
  teamCount: number;
  rosterSettings: RosterSettings;
  estimationSettings: EstimationSettingsState;
  searchSettings: SearchSettingsState;
}

// Core context snapshot for any point in a draft
interface DraftStateSnapshot {
  pickNumber: number;
  totalMoneySpent: number;
  moneySpentByPosition: Map<string, number>;
  playersPickedByPosition: Map<string, number>;
  budgetDistribution: BudgetDistribution;
  positionScarcityMetrics: Map<string, PositionScarcity>;
}

interface BudgetDistribution {
  averageRemaining: number;
  medianRemaining: number;
  minRemaining: number;
  maxRemaining: number;
  teamsWithLowBudget: number; // count of teams with <10% budget left
}

interface PositionScarcity {
  totalSlotsInLeague: number;
  slotsFilled: number;
  slotsRemaining: number;
  qualityPlayersRemaining: number; // top-tier options left
  scarcityRatio: number; // slotsRemaining / qualityPlayersRemaining
}

// Historical data for model training
interface HistoricalDraftContext {
  leagueId: LeagueId;
  seasonId: SeasonId;
  picks: HistoricalPick[];
}

interface HistoricalPick extends LiveDraftPick {
  stateSnapshot: DraftStateSnapshot; // draft state when pick was made
  baselinePrediction: number; // what exponential model predicted
  actualPriceDeviation: number; // actual - baseline
}

// Learned adjustment model
interface PriceAdjustmentModel {
  positionModels: Map<string, PositionAdjustmentModel>;
  overallModel: AdjustmentModel;
  lastTrainingDate: Date;
  trainingDataSize: number;
}

interface AdjustmentModel {
  scarcityCoeff: number;
  budgetPressureCoeff: number;
  intercept: number;
  r2: number; // model fit quality
}

interface PositionAdjustmentModel extends AdjustmentModel {
  position: string;
  positionDemandCoeff: number;
}

// Enhanced predictions
interface LivePricePrediction extends CostEstimatedPlayer {
  baselineCost: number; // from exponential curve
  contextualAdjustment: number; // $ adjustment from current state
  livePrediction: number; // baselineCost + contextualAdjustment
  adjustmentFactors: AdjustmentFactors; // breakdown of what's driving adjustment
  confidence: number; // 0-1, model confidence in adjustment
}

interface AdjustmentFactors {
  scarcityAdjustment: number;
  budgetPressureAdjustment: number;
  positionDemandAdjustment: number;
}
```

### Advanced Pricing Model

**🎯 FINAL APPROACH**: **Multiple Linear Regression** with 8 carefully selected features that naturally converges to baseline predictions in early draft states.

#### Linear Regression Model Architecture
The live prediction system uses multiple linear regression optimized for realistic data constraints:

**Core Philosophy**: Train a linear model that:
- **Early Draft**: Reduces to baseline-like behavior (contextual features ≈ 0)
- **Mid/Late Draft**: Leverages scarcity and budget pressure signals
- **Data Efficient**: Works with 500-2000 historical picks across seasons

#### Model Equation
```
PricePct = α + β₁(position) + β₂(positionRank) + β₃(overallRank) + 
           β₄(positionScarcity) + β₅(overallScarcity) + β₆(budgetSpentPct) + 
           β₇(budgetPressure) + β₈(positionalPressure) + ε
```

#### 8 Feature Set (Domain-Informed)

1. **Player Position** (`position`): Categorical (QB, RB, WR, TE, K, DEF)
2. **Player Position Rank** (`positionRank`): 1st QB, 2nd QB, etc.
3. **Player Overall Rank** (`overallRank`): 1-300 consensus ranking
4. **Position Scarcity** (`positionScarcity`): Higher-ranked players at position still available
5. **Overall Scarcity** (`overallScarcity`): Higher-ranked players overall still available  
6. **Budget Spent %** (`budgetSpentPct`): Percent of total league budget spent so far
7. **Overall Budget Pressure** (`budgetPressure`): League-wide over/under spending vs baseline
8. **Positional Budget Pressure** (`positionalPressure`): Position-specific over/under spending vs baseline

#### Natural Baseline Convergence
**Early Draft State** (picks 1-10):
- `budgetSpentPct ≈ 0%`
- `budgetPressure ≈ 0` (no trend yet)
- `positionalPressure ≈ 0` (no position trend yet)
- `positionScarcity` and `overallScarcity` near maximum

**Reduced Model**: `PricePct ≈ α + β₁(position) + β₂(positionRank) + β₃(overallRank)`

This approximates exponential baseline behavior using player characteristics only.

#### Training Strategy (On-Demand)

1. **Data Requirements**: 8 features × 15 samples = ~120 minimum samples ✅
   - Available: 500-2000 picks across multiple seasons
   
2. **On-Demand Training Approach**:
   - **No model storage**: Train fresh for each prediction request  
   - **Training cost**: 1-10ms (negligible vs 50-200ms data loading)
   - **Always fresh**: Uses latest historical data automatically
   - **Simpler architecture**: No model versioning or staleness issues
   
3. **Feature Engineering**:
   - Position as dummy variables (QB=baseline, others as coefficients)
   - Log transforms for rank features if needed
   - Standardization for pressure features

4. **Validation Strategy**:
   - Cross-validation by season (train on 2022-2023, test on 2024)
   - Early draft validation (picks 1-20 match baseline)
   - Late draft validation (picks 120+ use full context)

#### Key Advantages
- **Realistic Data Needs**: Works with available draft history
- **Interpretable**: Each coefficient has clear meaning
- **Fast Training/Prediction**: Linear model scales well (1-10ms training)
- **Always Fresh**: On-demand training uses latest historical data
- **Simple Architecture**: No model storage, versioning, or staleness issues
- **Baseline Compatible**: Natural convergence to exponential curve
- **Expandable**: Easy to add interaction terms if data supports

## Implementation Tasks

### Phase 1: Core Infrastructure (Foundation)
**Estimated Effort**: 1-2 sessions

#### Task 1.1: Create Live Draft Data Models ✅ COMPLETED
- **Files**: `src/app/storage/savedLiveDraftTypes.ts`
- **Scope**: Define TypeScript interfaces for live draft state
- **Acceptance Criteria**: 
  - ✅ All data types defined and exported
  - ✅ Integration with existing `savedMockTypes.ts` patterns (reused existing types like RosterSettings, LeagueTeam)
  - ✅ Proper typing for draft picks, teams, and trends
- **Implementation Notes**: 
  - Simplified design by removing schema versioning (not needed without localStorage)
  - Reused existing types: RosterSettings, LeagueTeam, EstimationSettingsState, SearchSettingsState
  - Used Record instead of Map for better serialization compatibility
  - Removed complex modeling types to focus on MVP functionality

#### Task 1.2: Create Live Draft Storage Interface ✅ COMPLETED
- **Files**: `src/lib/storage/interface.ts`
- **Scope**: Extend StorageAdapter with live draft methods
- **Acceptance Criteria**:
  - ✅ Methods for saving/loading live draft state
  - ✅ Pick history management (add/edit/delete)
  - ✅ Real-time state persistence
  - ✅ Uses existing storage abstraction patterns
- **Implementation Notes**:
  - Added 7 new methods to StorageAdapter interface: loadLiveDrafts, loadLiveDraft, saveLiveDraft, addLiveDraftPick, updateLiveDraftPick, deleteLiveDraftPick, deleteLiveDraft
  - Follows same patterns as existing methods (league-scoped, async, proper JSDoc)
  - Supports atomic pick operations for real-time updates

#### Task 1.3: Implement Storage Adapter Methods ✅ COMPLETED
- **Files**: `src/lib/storage/supabaseAdapter.ts`, `src/lib/storage/dexieAdapter.ts`, `src/lib/storage/localStorage.ts`, `src/lib/storage/memory.ts`
- **Scope**: Implement live draft storage in all adapters
- **Acceptance Criteria**:
  - ✅ **Dexie**: Fully implemented with proper date conversion and atomic operations
  - ✅ **Supabase**: Fully implemented with comprehensive error handling and fallback support
  - ❌ **Memory**: Interface defined but methods not implemented  
  - ❌ **LocalStorage**: Interface defined but methods not implemented
- **Implementation Notes**:
  - **✅ Dexie**: Complete implementation with JSON serialization/deserialization, Date object conversion, and proper transaction handling
  - **✅ Supabase**: Complete implementation with all 7 live draft methods, JSON serialization, proper database relationships, and comprehensive error handling
  - **❌ Memory/LocalStorage**: Interface methods not implemented (not required for MVP)
  - **✅ Database Schema**: Migration 002_live_draft_support.sql exists with proper RLS policies and has been applied
  - **✅ Type Safety**: TypeScript types generated for all Supabase tables
  - **✅ Tests**: Comprehensive test suite created, Dexie tests passing, Supabase integration tests exist (failing due to auth setup issues, not implementation issues)

### Phase 2: Price Prediction Engine (Algorithm) ✅ COMPLETED
**Estimated Effort**: 2-3 sessions

**🎯 Architectural Improvement**: During this phase, we identified and eliminated duplicate baseline model creation logic across the codebase. Created a shared `createBaselineModels()` utility in `analytics.ts` that is now used by:
- **MockDraft**: `analyzeDraft()` function for draft analysis
- **Live Draft**: `useLiveDraft` hook for price predictions  
- **PlayerScatterChart**: Could be integrated but kept separate due to different visualization needs

This consolidation ensures consistent baseline model creation, reduces code duplication, and simplifies maintenance.

#### Task 2.1: Create On-Demand Linear Regression Model ✅ COMPLETED  
- **Files**: `src/lib/models/live-draft/budgetConversions.ts`, `src/lib/models/live-draft/featureExtraction.ts`, `src/lib/models/live-draft/linearRegression.ts`, `src/lib/models/live-draft/liveDraftPredictor.ts`
- **Scope**: **FINAL**: Multiple linear regression with 8 domain-informed features, trained on-demand
- **Acceptance Criteria**:
  - ✅ Linear regression model with exactly 8 features (position, ranks, scarcity, budget pressure)
  - ✅ Natural baseline convergence when contextual features ≈ 0 (early draft)
  - ✅ **On-demand training**: Train fresh for each prediction request (1-10ms cost)
  - ✅ Feature extraction optimized for real-time prediction performance
  - ✅ Prediction engine with baseline integration and user choice support
  - ✅ Interpretable coefficients and prediction component breakdown
- **Architecture Decisions**:
  - ✅ **Percentage-based system** for universal compatibility
  - ✅ **Universal Compatibility**: Works with any budget size  
  - ✅ **Clean Data Architecture**: Percentage storage with `BudgetConverter`
  - ✅ **On-demand training**: No model storage needed - train when predicting
  - ✅ **Simple architecture**: No versioning, staleness, or storage complexity
- **Implementation Notes**:
  - **✅ BudgetConverter**: Clean percentage-based system supporting any league budget configuration
  - **✅ FeatureExtractor**: Data-driven 8-feature extraction with no hardcoded positions, uses existing exponential models from analytics.ts
  - **✅ LinearRegressionTrainer**: Uses ml-regression-multivariate-linear package with proper 2D array formatting
  - **✅ Comprehensive Testing**: 62/62 tests passing across all 3 core components (budget: 31/31, features: 16/16, regression: 15/15)
  - **✅ Real Data Integration**: Test utilities using existing ESPN draft fixtures and platform transformation functions
  - **🔧 Key Fix**: Discovered ml-regression expects y as 2D array `[[0.076], [0.078]]` not 1D `[0.076, 0.078]`
  - **📊 Manual R² Calculation**: Library doesn't implement R² so added custom calculation with predictions vs actuals
- **Implementation Components**:
  - **✅ Feature Extraction Engine**: Extract 8 features from draft state + historical context
  - **✅ Linear Regression Trainer**: Fast matrix operations for coefficient calculation using ml-regression
  - **✅ Prediction Engine**: `LiveDraftPredictor` coordinates training, baseline, and live predictions with clean separation of concerns
  - **✅ Baseline Integration**: Always-available baseline predictions with adjustment comparison for user choice
  - **✅ Historical Data Integration**: Training data preparation from multiple historical drafts with different budget configurations
- **Final Architecture Notes**:
  - **✅ User-Focused Design**: Model provides raw predictions and confidence metrics; UI handles interpretation and model selection
  - **✅ Explicit Training**: Clear training status feedback with model statistics (R², sample size, positions)
  - **✅ Graceful Degradation**: Baseline predictions always available as fallback option
  - **✅ Clean API**: `getBaselinePrediction()` and `getLivePrediction()` with separate training via `trainModel()`

#### Task 2.2: Create Spending Trends Calculator ✅ COMPLETED
- **Files**: `src/app/league/[leagueID]/live-draft/spendingAnalyzer.ts`  
- **Scope**: Analyze current draft for spending patterns
- **Acceptance Criteria**:
  - ✅ Position-by-position trend analysis
  - ✅ Inflation rates vs baseline predictions  
  - ✅ Roster need calculations
  - ✅ Budget status analysis across teams
- **Implementation Notes**:
  - Simplified design per user feedback - removed hardcoded position classifications ("premium" vs "utility")
  - Focus on providing spending information by position without assumptions about position importance
  - Uses `defaultPosition` from RankedPlayer type for position analysis
  - Includes both `analyzeSpendingTrends()` and `analyzeRosterNeeds()` functions
  - Provides inflation calculations vs baseline predictions
  - Includes budget status tracking with teams in trouble identification

#### Task 2.3: Create Live Draft Hook ✅ COMPLETED
- **Files**: `src/app/league/[leagueID]/live-draft/useLiveDraft.ts`
- **Scope**: React hook for live draft state management
- **Acceptance Criteria**:
  - ✅ Manages draft state and predictions
  - ✅ Handles pick entry/editing/deletion
  - ✅ Auto-saves state changes
  - ✅ Provides computed trends and analysis
- **Implementation Notes**:
  - **✅ Comprehensive Hook**: Created full-featured React hook with TypeScript interface for all live draft operations
  - **✅ State Management**: Uses useState for core draft state, loading, error, and saving states
  - **✅ Storage Integration**: Full integration with StorageAdapter for persistent draft operations
  - **✅ Pick Management**: Complete CRUD operations for draft picks (add, update, delete, undo)
  - **✅ Auto-save**: Debounced auto-save with 1-second delay to prevent performance issues
  - **✅ Prediction Engine**: Integration with LiveDraftPredictor for baseline and live predictions
  - **✅ Analysis Integration**: Real-time spending trends and roster analysis using existing analyzer functions
  - **✅ Error Handling**: Comprehensive error handling with user-friendly error messages
  - **✅ Performance Optimization**: Uses useMemo for computed analysis and useCallback for functions
  - **✅ Draft Lifecycle**: Full draft management (create, load, save, delete, reset)
  - **✅ Team Budget Tracking**: Automatic budget calculations and roster position tracking
  - **✅ State Snapshots**: Maintains draft context snapshots for historical analysis
  - **✅ Shared Baseline Models**: Uses new shared `createBaselineModels()` utility from `analytics.ts`
  - **✅ Architectural Improvement**: Consolidated duplicate baseline model logic across MockDraft, PlayerScatterChart, and LiveDraft systems

### Phase 3: UI Components (Interface) ✅ COMPLETED
**Estimated Effort**: 2-3 sessions | **Actual**: 3 sessions | **Status**: ENHANCED DURING REFACTORING

#### Task 3.1: Create Pick Entry Component ✅ COMPLETED
- **Files**: `src/app/league/[leagueID]/live-draft/PickEntry.tsx`
- **Scope**: Form for entering new draft picks
- **Acceptance Criteria**:
  - ✅ Player search with type-ahead using `PlayerSearchInput` component
  - ✅ Team selection dropdown with remaining budget display
  - ✅ Price validation with team budget checks
  - ✅ Auto-increment pick numbers with team rotation
  - ✅ Clear success/error feedback with loading states
- **Implementation Notes**:
  - **✅ Advanced Features**: Auto-focus team selection, live prediction display, form auto-clearing
  - **✅ Component Integration**: Uses `PlayerSearchInput`, `usePlayerSearch` hook, and validation utilities
  - **✅ UX Enhancements**: Success message duration, team budget display, helper text
  - **✅ Error Handling**: Comprehensive form validation with user-friendly error messages

#### Task 3.2: Create Draft History Component ✅ COMPLETED & ENHANCED
- **Files**: 
  - `src/app/league/[leagueID]/live-draft/DraftHistory.tsx` (refactored)
  - `src/app/league/[leagueID]/live-draft/components/DraftHistoryTable.tsx` ✅ NEW
  - `src/app/league/[leagueID]/live-draft/components/DraftHistoryRow.tsx` ✅ NEW
  - `src/app/league/[leagueID]/live-draft/components/common/SortableTableHeader.tsx` ✅ NEW
  - `src/app/league/[leagueID]/live-draft/hooks/useSorting.ts` ✅ NEW
- **Scope**: Display and manage entered picks
- **Acceptance Criteria**:
  - ✅ Table of all picks with edit/delete actions
  - ✅ Shows predicted vs actual prices with color-coded differences
  - ✅ Sortable by pick number, team, position, price, predicted, diff
  - ✅ Inline editing capability with player search and team selection
  - ✅ Undo last pick functionality with confirmation dialogs
- **MAJOR ENHANCEMENT**: **Refactored into modular, reusable architecture**
  - **✅ 66% code reduction**: 520+ lines → 174 lines in main component
  - **✅ Reusable components**: `SortableTableHeader` and `useSorting` hook can be used project-wide
  - **✅ Clean separation**: Table structure, row logic, and editing functionality properly separated
  - **✅ Better maintainability**: Single-responsibility components, easier testing
  - **✅ Enhanced UX**: Improved error handling, loading states, accessibility features

#### Task 3.3: Create Trends Dashboard Components ✅ COMPLETED
- **Files**: 
  - `src/app/league/[leagueID]/live-draft/SpendingTrends.tsx`
  - `src/app/league/[leagueID]/live-draft/RosterAnalysis.tsx`
- **Scope**: Visual display of spending and roster trends  
- **Acceptance Criteria**:
  - ✅ Position spending vs predictions with inflation rates
  - ✅ Overall market inflation tracking and alerts
  - ✅ Unfilled position tracking with urgency indicators
  - ✅ Budget remaining analysis with team status
  - ✅ Clear visual indicators for trends and market conditions
- **Implementation Notes**:
  - **✅ SpendingTrends**: Position-by-position analysis, market insights (most inflated/best value), market alerts for high/low inflation
  - **✅ RosterAnalysis**: Budget status cards, teams in trouble alerts, unfilled positions with urgency levels, projected spending breakdown
  - **✅ Component Architecture**: Uses shared utility functions, common UI components, and proper memoization
  - **✅ Data Visualization**: Color-coded trends, progress bars, stat cards, and contextual alerts
  - **✅ User Experience**: Empty states, loading indicators, responsive design, dark mode support

### Phase 4: Player Search Integration (Search)
**Estimated Effort**: 1-2 sessions

#### Task 4.1: Create Live Draft Player Search
- **Files**: `src/app/league/[leagueID]/live-draft/PlayerSearch.tsx`
- **Scope**: Searchable player selection for pick entry
- **Acceptance Criteria**:
  - Type-ahead search like MockTable
  - Filters out already-drafted players
  - Shows live predictions in results
  - Keyboard navigation support
  - Integrates with existing search patterns

#### Task 4.2: Enhance PlayerTable for Live Draft
- **Files**: `src/app/league/[leagueID]/drafts/[draftYear]/PlayerTable.tsx`
- **Scope**: Add live prediction columns and sorting
- **Acceptance Criteria**:
  - New columns for live predictions and trends
  - Maintains existing functionality
  - Performance optimized for frequent updates
  - Backward compatible with existing usage

### Phase 5: Main Page Integration (Assembly)
**Estimated Effort**: 2-3 sessions  

#### Task 5.1: Create Live Draft Main Page
- **Files**: `src/app/league/[leagueID]/live-draft/page.tsx`
- **Scope**: Main page layout and component orchestration
- **Acceptance Criteria**:
  - Responsive layout matching mockup
  - Integrates all components seamlessly
  - Handles loading and error states
  - Auto-saves draft state
  - Clean, professional interface

#### Task 5.2: Add Navigation and Routing
- **Files**: 
  - `src/app/league/[leagueID]/layout.tsx`
  - Navigation components
- **Scope**: Add live draft to league navigation
- **Acceptance Criteria**:
  - Clear navigation path to live draft
  - Breadcrumbs and page titles
  - Mobile-friendly navigation
  - Consistent with existing patterns

### Phase 6: Testing and Refinement (Validation)
**Estimated Effort**: 1-2 sessions

#### Task 6.1: Component Unit Tests  
- **Files**: `__tests__/live-draft/` directory
- **Scope**: Test individual components and utilities
- **Acceptance Criteria**:
  - Tests for prediction algorithm accuracy
  - Component rendering and interaction tests
  - Storage adapter integration tests
  - Error handling validation

#### Task 6.2: E2E Integration Tests
- **Files**: `e2e/tests/live-draft/` directory  
- **Scope**: End-to-end user workflow testing
- **Acceptance Criteria**:
  - Complete draft entry workflow
  - Pick editing and deletion
  - Settings persistence
  - Performance under typical usage
  - Cross-browser compatibility

#### Task 6.3: Performance and UX Refinement
- **Files**: Various component files
- **Scope**: Optimize performance and user experience  
- **Acceptance Criteria**:
  - Fast prediction updates (<100ms)
  - Smooth search experience
  - Intuitive keyboard shortcuts
  - Mobile responsiveness
  - Accessible design (WCAG compliance)

## Technical Considerations

### Performance
- **Memoization**: Heavy use of `useMemo` and `useCallback` for prediction calculations
- **Debouncing**: Search input and auto-save operations
- **Virtual Scrolling**: For large player lists (if needed)
- **Optimistic Updates**: UI updates immediately, sync in background

### Data Consistency
- **Atomic Operations**: Pick operations must be atomic to prevent corruption
- **Validation**: Server-side validation for all pick data
- **Conflict Resolution**: Handle concurrent editing scenarios
- **Backup/Recovery**: Ability to restore from corrupted state

### User Experience  
- **Progressive Enhancement**: Works without JavaScript for basic functionality
- **Offline Support**: Cache critical data for offline usage
- **Keyboard Navigation**: Full keyboard accessibility
- **Mobile Optimization**: Touch-friendly interface for mobile drafts

## Success Metrics

### Functional Success
- ✅ Users can enter draft picks in real-time
- ✅ Price predictions update accurately after each pick  
- ✅ All spending trends and roster analysis display correctly
- ✅ Pick editing/deletion works reliably
- ✅ Integration with existing components is seamless

### Performance Success
- ✅ Prediction updates complete in <100ms
- ✅ Search results appear in <200ms
- ✅ Page loads in <2s on average connection
- ✅ Smooth performance with 200+ picks entered

### User Experience Success  
- ✅ Interface is intuitive without training
- ✅ Mobile experience is equivalent to desktop
- ✅ No data loss during normal usage
- ✅ Clear error messages and recovery paths
- ✅ Integrates naturally with existing workflow

## Future Enhancements (Post-MVP)

### Advanced Features
- **Real-time Collaboration**: Multiple users tracking same draft
- **Draft Import**: Import picks from ESPN/Sleeper APIs  
- **Advanced Analytics**: Historical comparison, value tracking
- **Export Options**: PDF reports, CSV data export
- **Draft Simulation**: "What-if" scenarios during live draft

### Integration Opportunities
- **Platform APIs**: Auto-import picks from ESPN/Sleeper
- **Mobile App**: Companion mobile application
- **Notifications**: Real-time alerts for value picks
- **Social Features**: Share draft boards, collaborative tracking

This implementation plan provides a clear roadmap for building a comprehensive live draft tracking system that integrates seamlessly with the existing application architecture while providing powerful new functionality for fantasy football users.