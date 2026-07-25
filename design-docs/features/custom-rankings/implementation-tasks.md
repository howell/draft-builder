# Custom Positional Rankings — Implementation Tasks

## Overview

Task breakdown for the custom positional rankings board. Each task is independently
revertable and leaves the app in a working state. See [README.md](./README.md) for the
design rationale.

**Branch**: `worktree-custom-rankings`, off `origin/main`. Commit hashes are cited per
task below.

### Status summary

| Task | Status |
| --- | --- |
| 0. Design document | ✅ COMPLETED |
| 1. Fix Dexie user-settings upsert (prerequisite) | ✅ COMPLETED |
| 2. Extend ESPN platform rank coverage (prerequisite) | ✅ COMPLETED |
| 3. Data model + pure operations | ✅ COMPLETED |
| 4. Storage hooks | ✅ COMPLETED |
| 5. Page, board and sidebar nav | ✅ COMPLETED |
| 6. Drag-and-drop reordering | ✅ COMPLETED |
| 7. Tier dividers | ✅ COMPLETED |
| 8. Hide-platform-rank toggle | ✅ COMPLETED |
| 9. Copy from another league | 🔄 IN PROGRESS — hooks done, picker UI not built |
| 10. Reset to platform order | ⏳ PENDING |
| 11. Migrate anonymous settings on signup | ⏳ PENDING |
| 12. Regenerate ESPN fixtures with `platformRank` | ⏳ PENDING |

---

## Task 0: Design Document ✅ COMPLETED

**Files**: `design-docs/features/custom-rankings/README.md`, this file.

---

## Task 1: Fix Dexie User-Settings Upsert (prerequisite) ✅ COMPLETED

**Objective**: Make `setUserSetting` an upsert so a page that autosaves can persist more
than one edit.

**Commit**: `f51092e`

**Files**:
- `src/lib/storage/database-schema.ts` ✅
- `src/lib/storage/__tests__/adapter-contract.test.ts` ✅
- `src/lib/storage/__tests__/test-utils/dexie-test-utils.ts` ✅
- `src/lib/storage/dev-utils.ts` ✅

**Dependencies**: None. Must land before Task 4.

**Why this was a blocker**: `userSettings` was keyed by `++id`, so every `put()` inserted
a new row and `getUserSetting`'s `.first()` returned the *oldest*. Writes appeared to
succeed and silently reverted on reload. Reproduced against the repo's own dexie +
fake-indexeddb: three writes → three rows → read returns the first.

**Implementation**:
- New `settings` store keyed by `[userId+type+key]`, so `put()` is a genuine upsert.
- v3 copies rows across and dedupes by ascending id (newest write wins); v4 drops the old
  store. Two versions because IndexedDB cannot change a primary key in place — Dexie
  throws *"Not yet support for changing primary key"*.
- The v2 schema is now a frozen literal instead of being rebuilt from
  `SCHEMA_DEFINITION`, since that constant describes the current schema and Dexie needs
  each historical version declared as it was.
- `getUserSetting` became `this.settings.get([userId, type, key])`.
- `importUserData` uses `bulkPut` and no longer strips a now-meaningless `id`.

**Deviation from plan**: the approved plan assumed a caller-side fix would be an option.
It would not have been sufficient — it cannot repair rows already duplicated in users'
browsers, where reads would keep returning stale data forever. The migration dedupes
them.

**Testing**: `DexieStorageAdapter` added to the contract suite (it was absent, which is
why this was never caught), plus an explicit row-count regression test and a
"newest value wins after many writes" test across all three adapters.

**Acceptance criteria**:
- ✅ Repeated `setUserSetting` calls leave exactly one row
- ✅ Reads return the most recent value
- ✅ Existing duplicated rows are collapsed on upgrade, keeping the newest
- ✅ Contract suite covers Dexie

---

## Task 2: Extend ESPN Platform Rank Coverage (prerequisite) ✅ COMPLETED

**Objective**: Give the board a meaningful prefill order for more than the top ~124 ESPN
players.

**Commit**: `8d64c28`

**Files**:
- `src/platforms/PlatformApi.ts` ✅ added `Player.platformRank`
- `src/platforms/espn/EspnApi.ts` ✅ populate from `draftRanksByRankType`
- `src/rankings/loadRankings.ts` ✅ new — extracted from `MockDraft.tsx`
- `src/rankings/__tests__/loadRankings.test.ts` ✅ new
- `src/app/league/[leagueID]/mocks/MockDraft.tsx` ✅
- `src/hooks/queries/useRankingsQuery.ts` ✅

**Dependencies**: None. Must land before Task 3.

**Why this was a blocker**: only 124 of 985 ESPN fixture players (250 of 2750 live) have
a nonzero auction value. The rest tied at 0 and fell back to API order, which the mock
draft's cost model then presented as distinct dollar estimates. A board prefilled from
that would have been mostly noise.

**Implementation**: ESPN's dense `draftRanksByRankType[PPR|STANDARD].rank` was already in
the `kona_player_info` response and discarded during mapping. It now populates
`platformRank` and breaks price ties.

**Additional work completed** (all pre-existing defects in the code being touched):
- `rankByPlatformPrice` no longer sorts the caller's array in place — that array is the
  React Query players cache entry.
- Quadratic `filter(...).indexOf(player)` positional-rank lookup replaced with a running
  counter (Sleeper returns ~10k players).
- `loadRankingsFor`/`rankByPlatformPrice` extracted to `src/rankings/loadRankings.ts`,
  breaking a live import cycle between `useRankingsQuery` and `MockDraft.tsx` and keeping
  the mock-draft bundle out of other consumers.

**Testing**: 6 unit tests — price ordering, rank tie-break, priced-above-unpriced,
unranked-last, per-position numbering, and no mutation of the input array.

**Acceptance criteria**:
- ✅ Players outside the auction-value set are ordered by ESPN's published rank
- ✅ Existing top-of-board ordering is unchanged (price still sorts first)
- ✅ The players cache is not mutated

---

## Task 3: Data Model + Pure Operations ✅ COMPLETED

**Objective**: Types and total functions for a board, with no React or app-router
dependency.

**Commit**: `3d45262`

**Files**:
- `src/types/customRankings.ts` ✅
- `src/lib/rankings/customRankings.ts` ✅
- `src/lib/rankings/__tests__/customRankings.test.ts` ✅

**Dependencies**: Task 2.

**Implementation**: `buildRankingPool`, `prefillItems`, `reconcileItems`, `itemKey`,
`moveItem`, `moveBy`, `insertTierBefore`, `removeTier`, `renameTier`, `nextTierId`,
`toTierGroups`. Tier dividers are items in the same flat list as players — see
[README.md](./README.md#data-model-tier-dividers-are-items-not-containers).

Placed in `src/lib` rather than the app-router tree so hooks can import it without
repeating the layering mistake fixed in Task 2. Note `src/rankings/` is **not** in the
Tailwind content globs, so UI must not live there.

`nextTierId` is deterministic rather than `crypto.randomUUID()`, so tier ids are stable
and assertable in tests.

**Testing**: 37 unit tests, including that `buildRankingPool` does not mutate its input,
tolerates `position: null` (~240 Sleeper players have it), de-duplicates a corrupted
blob listing a player twice, and that removing a tier merges its players upward.

**Acceptance criteria**:
- ✅ All operations are total functions over plain JSON
- ✅ Reconciliation is idempotent and preserves tier markers
- ✅ Nothing imports React

---

## Task 4: Storage Hooks ✅ COMPLETED

**Objective**: Read, write and copy a board through the storage abstraction.

**Commit**: `4e1f8a2`

**Files**:
- `src/hooks/queries/useCustomRankings.ts` ✅
- `src/hooks/queries/__tests__/useCustomRankings.test.tsx` ✅
- `src/hooks/queries/cache-keys.ts` ✅
- `src/hooks/queries/index.ts` ✅

**Dependencies**: Tasks 1, 3.

**Implementation**: `useCustomRankingsQuery`, `useSaveCustomRankingsMutation`,
`useCopyCustomRankingsMutation`, `useCustomRankingsIndexQuery`. Persists via
`getUserSetting`/`setUserSetting` with `type: 'app'` and one key per league — see
[README.md](./README.md#storage-user_settings-blob-one-key-per-league).

`refetchOnWindowFocus: false`, because the board holds unsaved edits in local state and a
tab switch must not race them.

**Testing**: 12 tests against a real `MemoryStorageAdapter`, including that repeated
saves overwrite rather than append, that leagues stay isolated by key, that tier markers
are not counted as players in the index, and that a cross-platform copy throws
`CrossPlatformCopyError` without writing anything.

**Acceptance criteria**:
- ✅ No change to `StorageAdapter`, the four adapters, Dexie schema, or SQL
- ✅ A failed save rolls back the cache only, not caller state
- ✅ Cross-platform copies are refused

---

## Task 5: Page, Board and Sidebar Nav ✅ COMPLETED

**Objective**: A working, navigable rankings page.

**Commit**: `97f64fa`

**Files**:
- `src/app/league/[leagueID]/rankings/page.tsx` ✅
- `src/app/league/[leagueID]/rankings/CustomRankings.tsx` ✅
- `src/app/league/[leagueID]/rankings/RankingsToolbar.tsx` ✅
- `src/app/league/[leagueID]/rankings/PositionBoard.tsx` ✅
- `src/app/league/[leagueID]/rankings/PlayerRow.tsx` ✅
- `src/app/league/[leagueID]/rankings/TierDividerRow.tsx` ✅
- `src/app/league/[leagueID]/layout.tsx` ✅ sidebar link
- `src/lib/storage/supabase.ts` ✅ see below
- `e2e/page-objects/rankings-page.ts` ✅
- `e2e/tests/rankings/custom-rankings.spec.ts` ✅

**Dependencies**: Task 4.

**Implementation**: Server page guards `isLeagueId` and a missing `GOOGLE_API_KEY`.
The latter matters because `useRankingsQuery` is gated on a truthy key and a *disabled*
query is not `isLoading`, so `LoadingScreen` would otherwise let a blank page through.

Reuses `useLeagueQuery`, `usePlayersQuery`, `useLeagueHistoryQuery`, `useRankingsQuery`;
deliberately skips `useDraftHistoryQuery`, which this page does not need.

`RankingsToolbar` is not built on `TabContainer` — that component owns its selected index
internally and exposes no value/onChange, so it cannot drive parent state.

**Bugs found and fixed during verification**:
1. **Hydration raced the rankings query.** Until a reference ranking exists,
   `buildRankingPool` falls back to alphabetical order. Hydrating from that froze an
   alphabetical board into local state while the ranked pool arriving moments later only
   partially matched it — visible as an alphabetical list with gaps in the numbering
   (1, 6, 8, 11…). Hydration now also waits for the rankings query to settle.
2. **`SupabaseStorageAdapter.getUserSetting`/`setUserSetting` had no `withTimeout`**,
   unlike every other operation on that adapter, so a stalled request never settled,
   `withFallback` never reached Dexie, and the page hung forever instead of degrading.
3. **Ordinals could show gaps.** The counter now only counts rows that actually render,
   so an item with no pooled player can never leave a hole in the numbering.

**Testing**: verified visually in light and dark mode. E2E covers prefill order, position
switching, button reorder with reload persistence, and sidebar navigation.

**Acceptance criteria**:
- ✅ Board prefills in platform-rank order, ordinals contiguous from 1
- ✅ Reachable from the league sidebar with active-state styling
- ✅ Order survives a reload
- ✅ Fails loudly rather than blank when `GOOGLE_API_KEY` is unset

---

## Task 6: Drag-and-Drop Reordering ✅ COMPLETED

**Objective**: Drag rows to reorder, keyboard-accessible and usable on touch.

**Commit**: `d4b2a2b`

**Files**:
- `src/app/league/[leagueID]/rankings/SortableRow.tsx` ✅
- `src/app/league/[leagueID]/rankings/PositionBoard.tsx` ✅
- `package.json` ✅ `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`

**Dependencies**: Task 5.

**Implementation**: One `DndContext` + `SortableContext` per position. dnd-kit lives only
in `SortableRow`, which hands the row components a drag handle to place — `PlayerRow` and
`TierDividerRow` stay free of it and still render without a `DndContext`.

Sensor choices and the `z-index: 60` drag layer are documented in
[README.md](./README.md#accessibility). The `TouchSensor` hold delay is not optional:
without it, touch-dragging swallows page scroll and the board becomes unscrollable on a
phone.

`@dnd-kit/core@6.3.1` declares `react: >=16.8.0`, so it installs cleanly against React
19.2 with no `--legacy-peer-deps`.

**Testing**: E2E covers mouse drag and keyboard reorder. The drag is hand-rolled from
`mouse.move`/`down`/`up` rather than `locator.dragTo` — the `PointerSensor`'s distance
constraint needs intermediate `pointermove` events, and `dragTo`'s single-step move never
activates it. Keyboard activation uses `Enter`.

**Acceptance criteria**:
- ✅ Dragging reorders and persists across a reload
- ✅ Keyboard reorder works from the drag handle
- ✅ Move up/down buttons still work (mobile and screen-reader path)

---

## Task 7: Tier Dividers ✅ COMPLETED

**Objective**: Group players into tiers.

**Commit**: `97f64fa` (rows), `d4b2a2b` (draggable)

**Implementation**: "Start a new tier above" on every row; tier rows carry an editable
label, a live player count, move up/down, and remove. Tier markers are draggable like any
other row. Labels default to `Tier N` by position in the list.

**Acceptance criteria**:
- ✅ A tier divider survives a reload
- ✅ Removing a tier merges its players upward
- ✅ Boards saved with no tiers render unchanged

---

## Task 8: Hide-Platform-Rank Toggle ✅ COMPLETED

**Objective**: Let the user suppress the reference rank so it does not anchor them.

**Commit**: `97f64fa`

**Implementation**: `<button role="switch" aria-checked>` in the toolbar — there is no
Toggle in `src/ui/`, and adding a shared component for one consumer was not warranted.
State persists in the same per-league blob (`hidePlatformRank`), which costs no extra
read or write. The column is removed from the DOM rather than visually hidden.

The toggle is only rendered when a reference ranking exists.

**Acceptance criteria**:
- ✅ Toggling removes the rank column
- ✅ The choice survives a reload

---

## Task 9: Copy From Another League 🔄 IN PROGRESS

**Objective**: Seed a league's board from another league's.

**Completed**:
- ✅ `useCopyCustomRankingsMutation` — clones the source blob onto the target key
- ✅ `useCustomRankingsIndexQuery` — lists leagues that have a saved board, with counts
- ✅ `CrossPlatformCopyError` guard and its test

**Remaining**:
- ⏳ `CopyRankingsDialog.tsx` — picker listing same-platform leagues with a board
- ⏳ Toolbar entry point and an overwrite confirmation when the target already has data
- ⏳ E2E covering a copy between two same-platform leagues

**Notes**: no merge logic is needed. Reconciliation already runs on load, so players the
target league does not carry get dropped and its extras get appended in rank order.

---

## Task 10: Reset to Platform Order ⏳ PENDING

**Objective**: Discard a position's board and start over from the platform ranking.

**Plan**: `prefillItems(pool)` for the active position behind a confirmation, surfaced
from `RankingsToolbar`. The pure function already exists and is tested; this is UI only.

---

## Task 11: Migrate Anonymous Settings on Signup ⏳ PENDING

**Objective**: Stop anonymous users losing a hand-built board when they create an
account.

**Problem**: `src/lib/storage/migration-service.ts` migrates leagues and drafts only — it
has zero references to `user_settings`. A board built while signed out is lost at signup,
and `clearAllData` does not even remove the orphaned `userId: 'anonymous'` rows.

**Plan**: re-key anonymous `settings` rows to the real uid and upsert them into Supabase
as part of `migrateAllUserData`. Generic over `type: 'app'` settings, so it also fixes the
same latent gap for `useLeaguePriceMultipliers`.

**Deferred because**: it expands the change into the migration service, which the storage
design for this feature was specifically shaped to avoid. Accepted as parity with
existing behaviour for v1.

---

## Task 12: Regenerate ESPN Fixtures With `platformRank` ⏳ PENDING

**Objective**: Let E2E exercise the dense-rank ordering added in Task 2.

**Problem**: `e2e/fixtures/espn/fetch-players-espn.json` is mapped `Player[]` output
captured before `platformRank` existed, so every fixture player has it undefined and the
tie-break path is never hit in tests.

**Plan**: run `scripts/generate-espn-fixtures.ts`.

**Blocked on**: requires live ESPN credentials, and the committed fixtures are 2025-era
while the script would capture the current season — a large diff that may break other
specs asserting 2025 values. Needs an explicit decision before running.
