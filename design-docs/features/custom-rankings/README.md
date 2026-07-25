# Custom Positional Rankings

## Overview

Draft Builder previously only ever showed the user *someone else's* opinion of player
value — ESPN's auction values, or the Sleeper ADP sheet. There was nowhere to record the
user's own ordering.

This feature adds a per-league board at `/league/[leagueID]/rankings` where the user
drags players into a personal order within QB / RB / WR / TE and groups them into tiers.
The pool is prefilled from the platform's rank order — fetched exactly the way the mock
draft fetches it — so there is no blank page and no manual data entry. The platform
reference rank sits alongside each player and can be hidden, so it does not anchor the
user's judgement.

**Status**: core feature implemented and merged to `worktree-custom-rankings`. See
[implementation-tasks.md](./implementation-tasks.md) for per-task status and what
remains.

## Requirements

| Decision | Choice |
| --- | --- |
| Scope | Per league, with a "copy from another league" action |
| Interaction | Drag to reorder, plus tier dividers |
| Unranked players | Prefill the whole pool from platform order |
| Positions | QB / RB / WR / TE only (no overall board, no K/DST/FLEX) |
| Reference rank | Reuse `useRankingsQuery` — the same source as the mock draft |
| NFL team column | Out of scope; `Player` carries no team field |

## Architecture

```
src/types/customRankings.ts            persisted types + RANKABLE_POSITIONS
src/lib/rankings/customRankings.ts     pure pool/reorder/tier operations (no React)
src/hooks/queries/useCustomRankings.ts React Query read/write/copy hooks
src/rankings/loadRankings.ts           shared ranking assembly (extracted, see below)
src/app/league/[leagueID]/rankings/
  page.tsx                             server page; isLeagueId + GOOGLE_API_KEY guards
  CustomRankings.tsx                   client orchestrator: queries, state, autosave
  RankingsToolbar.tsx                  position picker, hide-rank switch, save status
  PositionBoard.tsx                    DndContext + SortableContext for one position
  SortableRow.tsx                      dnd-kit wrapper; supplies a drag handle
  PlayerRow.tsx                        one player row
  TierDividerRow.tsx                   one tier marker row
```

### Data model: tier dividers are items, not containers

A board is a flat ordered list in which tier dividers are themselves items:

```ts
export type CustomRankingItem =
  | { kind: 'player'; playerId: PlayerId }
  | { kind: 'tier'; tierId: string; label?: string };
```

A player belongs to the nearest preceding tier marker; players before the first marker
form an implicit leading group. Groups are **derived for rendering** (`toTierGroups`),
never stored.

This was chosen over tiers-as-containers and over index-based tier breaks because:

- **Drag complexity.** A flat list needs one `SortableContext` and one `arrayMove`.
  Containers would need multi-container dnd-kit — custom collision detection, an
  `onDragOver` transfer step, droppable empty tiers, and a `DragOverlay` — roughly 4-5×
  the wiring, and the part of dnd-kit most commonly gotten wrong.
- **Pool churn.** Reconciliation is a `filter` plus a `concat`, and a tier marker can
  never be orphaned by the players around it disappearing. Index-based breaks would have
  to be remapped on every move, insert, and reconcile — a permanent invariant to
  maintain and the most likely source of silent corruption.
- **Serializability.** Everything is plain JSON. Note that `Rankings` in
  `src/types/storage.ts` uses `Map`, which is *not* serializable and must never be
  persisted directly.

Deleting a tier removes only its marker, so its players merge into the preceding tier —
the behaviour users expect.

### Storage: `user_settings` blob, one key per league

Boards persist through the existing `StorageAdapter.getUserSetting`/`setUserSetting`
with `type: 'app'` and key `customRankings:<leagueId>`. This deliberately avoids a
`StorageAdapter` interface change, all four adapter implementations, a new
`UserSettingType`, a Dexie schema bump, a SQL migration, the migration service, and the
adapter contract suite.

One key **per league** rather than a single map of all leagues: a board is ~250 ids per
position and the page autosaves on every edit, so a shared blob would rewrite every
league's data on each change and invite read-modify-write clobbering between tabs. The
cost is that the copy picker cannot see which leagues have data from a single read,
which is what `useCustomRankingsIndexQuery` is for — it fans out over the user's leagues
and only runs while the picker is open.

### Pool construction and sizing

The reference ranking is `rankings[0]` from `useRankingsQuery` (ESPN → the platform's
auction-value/rank ordering; Sleeper → the scoring-type-matched ADP sheet). Players are
filed by `player.position`, not `eligiblePositions`, so each appears on exactly one
board — the mock draft needs multi-position eligibility for lineup slotting, a positional
board does not.

Per-position caps, not one overall cap:

```ts
export const DEFAULT_POOL_LIMITS = { QB: 40, RB: 80, WR: 90, TE: 40 }; // ≈ 250
```

An overall top-300 by rank yields roughly fifteen tight ends, which is useless for a TE
board. The caps are also load-bearing rather than cosmetic: every row is a `useSortable`
subscriber, ESPN returns up to 1000 players and Sleeper ~10k, and keeping each list near
100 rows avoids needing virtualization — which combines badly with sortable.

### Reconciliation

`reconcileItems` runs on every load. It keeps all tier markers, keeps player items still
in the pool, and appends pool players not already present at the end in reference order,
reporting `addedIds` / `removedIds` so the UI can mark new arrivals. It deliberately does
**not** invent a tier for new players: silently restructuring someone's tiers is worse
than telling them what changed.

### Save semantics

Debounced autosave (700ms), no Save button. There is no natural commit point in a drag
interaction, and an explicit-save model loses a long reordering session to a stray
navigation. `MockTable` already establishes this pattern in the codebase. Local state is
hydrated **once** behind a ref — deriving on render would let a background refetch
clobber unflushed edits — and the debounce effect flushes on unmount so leaving the page
persists. A failed save rolls back the cache only, leaving local state intact so the
user's ordering survives and can be retried.

### Accessibility

- Sensors: `PointerSensor` (5px distance, so the handle's click still works),
  `TouchSensor` (200ms hold — without it, touch-dragging swallows page scroll and the
  board becomes unscrollable on a phone), `KeyboardSensor` with
  `sortableKeyboardCoordinates`, plus position-aware drag announcements.
- Every row also carries **Move up / Move down** buttons. These are the mobile path, the
  screen-reader path, and the only reorder path testable under this repo's jsdom setup.
- The platform rank column is **removed from the DOM** when hidden rather than visually
  hidden, so the accessibility tree and the visual layout agree.
- A dragged row gets `z-index: 60` so it renders above the fixed sidebar at `z-50`.

## Pre-existing bugs found and fixed

Three defects surfaced while verifying this feature against the running app. All predate
it, and all were blocking.

### 1. Dexie silently discarded repeated writes (`f51092e`)

The `userSettings` store was keyed by an auto-increment `++id`, so every `put()` was an
insert rather than an upsert. Repeated saves piled up duplicate rows, and
`getUserSetting`'s `.first()` returned the **oldest** — writes appeared to succeed and
silently reverted on reload. Reproduced against the repo's own dexie + fake-indexeddb:
three writes produced three rows and the read returned the first value.

This hit anonymous users directly (`AuthProvider` hands out `DexieStorageAdapter`) and
authenticated users whenever `SupabaseStorageAdapter` fell back to Dexie. It went
unnoticed because the only caller, `useLeaguePriceMultipliers`, writes rarely — and
because `DexieStorageAdapter` was absent from the adapter contract suite. A page that
autosaves would have broken on the second edit.

IndexedDB cannot change a store's primary key in place (Dexie throws *"Not yet support
for changing primary key"*), so rows are copied into a new `settings` store keyed by
`[userId+type+key]` in v3 and the old store dropped in v4. The copy dedupes by ascending
id so the newest write wins, **repairing databases that already accumulated
duplicates** — something a caller-side fix could not have done.

`DexieStorageAdapter` is now in the contract suite, with an explicit row-count regression
test.

### 2. ESPN's long tail was ordered by accident (`8d64c28`)

`espnPlatformPrice` falls back to `0`, and ESPN assigns a nonzero auction value to only a
few hundred players — 124 of 985 in our fixture, 250 of 2750 in a live season-2025
sample. Everything else tied at 0 and fell back to whatever order the API returned. That
arbitrary order then fed the mock draft's cost model (an exponential of overall rank),
which presented it as distinct dollar estimates. The ordering looked meaningful and was
not.

ESPN publishes a dense draft rank in the same payload — every one of the 2750 players
carrying `draftRanksByRankType` had a nonzero PPR rank. It was already on the wire in the
`kona_player_info` view and simply discarded during mapping. `Player.platformRank` now
carries it and breaks price ties.

This is what the long-commented-out block in `rankByPlatformPrice` was reaching for; it
could not work there because by that point the values are mapped `Player`s with no
`.player` field.

### 3. `getUserSetting`/`setUserSetting` had no timeout (`97f64fa`)

Unlike every other operation on `SupabaseStorageAdapter`, these two did not go through
`withTimeout`. A stalled request therefore never settled, so `withFallback` never got to
reach for Dexie and any caller gated on the promise hung indefinitely rather than
degrading. This is what made the rankings page hang whenever Supabase was slow.

### Adjacent cleanups (`8d64c28`)

- `rankByPlatformPrice` no longer sorts the caller's array in place. That array is the
  one held in the React Query players cache, so loading rankings was reordering it for
  every other consumer as a side effect.
- The per-player `filter(...).indexOf(player)` positional-rank lookup became a running
  counter. The array is already sorted so the result is identical, but the old form was
  quadratic and Sleeper returns ~10k players.
- `loadRankingsFor` / `rankByPlatformPrice` moved out of `MockDraft.tsx` into
  `src/rankings/loadRankings.ts`. `useRankingsQuery` imported them from an app-router
  component file, which formed a live import cycle with `@/hooks/queries` and pulled
  `MockTable`, `PlayerTable` and the regression library into every consumer's bundle.
  Extracting also made the ranking logic unit-testable, which it now is.

## Known limitations

- **Anonymous boards are lost at signup.** `migration-service.ts` migrates leagues and
  drafts only; it never touches `user_settings`. A board built while signed out does not
  survive account creation. This is the same pre-existing gap `useLeaguePriceMultipliers`
  has, and was accepted for v1 rather than expanding the blast radius into the migration
  service. See [implementation-tasks.md](./implementation-tasks.md) Task 10.
- **Cross-platform copy is refused.** ESPN and Sleeper player ids share no namespace, so
  a cross-platform copy would drop every player and present as an empty board rather than
  an error. `useCopyCustomRankingsMutation` throws `CrossPlatformCopyError` instead.
  Name-based matching would be needed to support it.
- **Season rollover.** `CURRENT_SEASON` flips in March with no deploy, so a board written
  one season persists into the next. The stored blob carries `season`; reconciliation
  drops retirees and appends rookies, but no "carried over from last season" notice is
  shown yet.
- **Position drift.** Using `player.position` means an ESPN reclassification moves a
  player between boards and loses their manual placement. Reconciliation handles it
  correctly, but the placement is not recoverable.
- **ESPN fixtures predate `platformRank`.** `e2e/fixtures/espn/fetch-players-espn.json`
  is mapped output captured before the field existed, so E2E does not exercise the
  dense-rank path. Regenerating requires live ESPN credentials and would rewrite
  2025-era committed fixtures.

## Testing

| Layer | Coverage |
| --- | --- |
| `src/lib/rankings/__tests__/customRankings.test.ts` | 37 tests — pool building, reconciliation, moves, tier operations, group folding |
| `src/hooks/queries/__tests__/useCustomRankings.test.tsx` | 12 tests against a real `MemoryStorageAdapter` |
| `src/rankings/__tests__/loadRankings.test.ts` | 6 tests — price ordering, rank tie-break, no input mutation |
| `e2e/tests/rankings/custom-rankings.spec.ts` | 8 specs — prefill order, position switching, button/drag/keyboard reorder, and persistence of order, hidden rank and tiers across reload |

The bulk of the logic is deliberately in pure functions because `jest.setup.ts` replaces
`global.window` with a stub, which breaks React 19's value tracking and rules out testing
the drag surface in jsdom. Drag is covered in Playwright only.

**E2E environment caveat.** The fixture environment has no usable Supabase, so the
league, players, rankings and saved-board reads each spend the adapter's full 8s timeout
before falling back to Dexie. Board-ready waits in the page object are set to 45s for
that reason; the page is not slow in production. Under high machine load these specs
still flake — verify on a quiet machine.

## Related

- [Live Draft](../live-draft/implementation-plan.md) — shares the same player-pool fetch
  chain via `useSimulatorData`.
- [User Accounts](../user-accounts/README.md) — owns the migration service referenced in
  the anonymous-boards limitation.
