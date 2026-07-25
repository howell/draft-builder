# Landing Page UX Redesign

**Status: ✅ COMPLETED** (branch `ux-improvements`, 2026-07-20)

## Problem

1. **No sign-in path for returning users.** The landing page's only auth CTA was the sign-up-flavored "Create Free Account"; there was no global header, and the sidebar only appears once leagues are saved. Returning users had to know to navigate to `/auth` manually.
2. **Design inconsistency.** The "Unlock Premium Features" card (purple gradient) and "Ready to get started?" card (blue→purple gradient) clashed with the rest of the app. The settings page's clean Card-based style is the design north star.

## What was implemented

### New reusable components
- **`src/ui/AppHeader.tsx`** — slim auth-aware header: "Draft Builder" wordmark; anonymous users see "Log in" + "Sign up" **links** (roles matter: e2e specs select `/auth` tab *buttons* named "Sign In"/"Sign Up", so header affordances must stay links); authenticated users see their email prefix + Logout button.
- **`src/ui/PageShell.tsx`** — shared page scaffold: `bg-gray-50 dark:bg-gray-900`, centered column (`maxWidth` md/2xl/4xl/6xl), optional `header` slot, `sidebarOffset` (applies `md:ml-44` only when the sidebar is actually rendered — previously the landing page was always offset, wasting space), `centerContent` for auth-style screens.
- **`buttonClasses()`** exported from `src/ui/Button.tsx` so `<Link>`s can share exact Button styling.

### Landing page (`src/app/page.tsx`)
- Wrapped in `PageShell` + `AppHeader`; sidebar offset now conditional.
- CTA card is a plain `Card` with `Button`-styled primary link → `/auth?mode=signup`, an "Already have an account? Sign in" link → `/auth`, and the "Continue without account" dismiss. No gradients remain.
- Hand-rolled error box replaced with `Alert variant="error"` (keeps `role="alert"` + `bg-red-50` for e2e).
- Authenticated "Welcome back" hero kept; its Logout button moved into the header.
- Full dark-mode support; stray `text-sky-600`/`text-blue-600` links normalized to `primary-*` tokens.

### League connect forms
- `src/app/leagueInputs.tsx` internals swapped to `ui/Input`/`ui/Button` (exported names/signatures unchanged; `name="League ID"`, `data-testid`s, "Submit" label preserved for e2e).
- `EspnLogin`/`SleeperLogin`: instruction `<h1>`s demoted to styled text, dark-mode variants, validation copy byte-identical.

### Supporting components
- `AccountBenefits`: gradient removed, emoji → Font Awesome icons in primary tint (FA is pinned to 6.0.0-beta3 — use FA5-compatible names like `fa-mobile-alt`, `fa-sync-alt`, `fa-chart-bar`), dark variants in compact + full modes; copy unchanged.
- `DataPreview`: normalized to `Card` (only used on landing), FA icons, dark variants; `data-testid="migration-preview"` kept (`Card` gained a `data-testid` prop).
- `AuthPage`: shell replaced with `PageShell maxWidth="md"` + `AppHeader showAuthActions={false}`; segmented control restyled with dark variants (labels "Sign In"/"Sign Up" kept as buttons for e2e).
- `/auth?mode=signup` deep-linking via `useSearchParams` (Suspense-wrapped in `src/app/auth/page.tsx`).

## Verification
- `type-check`, `lint`, `npm test` (67/67 suites), `npm run build` all pass. Note: build needed `NODE_OPTIONS=--max-old-space-size=8192` in the worktree (TS step OOMs at default heap; Next infers the parent repo as workspace root due to dual lockfiles).
- Visual QA via Playwright at 1440×900 and 390×844, light + dark, including validation/error states and both `/auth` modes.
- e2e `auth` + `platform-integration` (chromium): **30/30 passing** after the e2e infra fixes below (initially 21 failed for pre-existing reasons unrelated to the redesign).

## E2E infra fixes (follow-up pass, same branch)
1. **`users_pkey` duplicate-key (20 tests)** — `e2e/utils/database-helpers.ts#createTestUser` plain-inserted the `public.users` row, colliding with the `on_auth_user_created` trigger from commit `17c0a21`. Fixed with an `upsert(..., { onConflict: 'id' })`.
2. **Signup-confirmation flow (1 test)** — two stacked causes:
   - The running GoTrue container had a stale allow-list (`GOTRUE_URI_ALLOW_LIST=https://127.0.0.1:3000`, no `/auth/callback`), so the verify link fell back to the site URL. Fixed by restarting Supabase so `config.toml` reloads. **Note:** restarting surfaced that the local Postgres data volume is PG 17 while `config.toml` said `major_version = 15`; the config was updated to 17 to match the volume (verify prod's version with `SHOW server_version;` — the local volume had been running 17 for weeks regardless).
   - Even with the redirect fixed, admin `generateLink` action links redirect with **implicit-grant fragment tokens**, which the app's `flowType: 'pkce'` client explicitly refuses (`Not a valid PKCE flow url.` in auth-js). Fixed properly: `/auth/callback` now also handles the `token_hash` + `type` form via `supabase.auth.verifyOtp` (Supabase's recommended email-template style; also future-proofs prod), and the e2e helper builds that URL from `properties.hashed_token` instead of visiting the action link.
3. **Flaky ESPN private-league tests** — post-navigation assertions used the global 3s expect timeout (the Playwright web server runs `next dev`, so cold route compiles exceed it) and two bare/ambiguous locators (`getByRole('heading')`, `text=/draft|auction/i`) that strict-mode-violate once the page fully renders. Fixed with `TEST_TIMEOUTS.LOADING_DIALOG` and specific locators.

## League pages: sidebar + dark mode (follow-up pass, same branch)

Fixes for the mobile league-page experience:

- **`Sidebar` responsive rework** (`src/ui/Sidebar.tsx`): previously `useState(true)` + always `position: fixed` — open by default on phones, overlaying content with no backdrop, while desktop consumers papered over the overlap with mismatched offsets (`md:ml-44` vs the sidebar's 12rem width) or no-op flex wrappers. Now: desktop (md+) renders as a static flex child inside the existing `flex md:flex-row` wrappers (collapsible to a rail; nav must stay `md:relative`, not `md:static`, or its absolutely-positioned toggle escapes the nav); mobile renders closed by default with a fixed hamburger (`sidebar-open` testid), full-height drawer, tap-to-close backdrop, and close-on-link-click (event capture, not a pathname effect — the `react-hooks/set-state-in-effect` lint rule forbids the effect form).
- **`PageShell` gained a `sidebar` slot** (replacing the `sidebarOffset` hack); landing page passes `Sidebar` through it. Header column pads left on mobile (`pl-12 md:pl-0`) to clear the hamburger; league/demo layouts use `pt-16 md:pt-4` on `main` for the same reason.
- **Dark mode**: league dashboard heading/copy, league layout background (`bg-gray-50 dark:bg-gray-900`), demo page, `ErrorScreen`, `LoadingScreen` all got `dark:` variants. The `globals.css` body gradient (pure black in dark mode, off-palette gray gradient in light) was replaced with the design-system page treatment — body now matches `PageShell`/settings.
- Verified: mobile 390×844 and desktop 1440×900, light + dark, drawer open/close/backdrop/nav-close, desktop collapse toggle; jest 67/67; full chromium e2e run — mock-drafts failures were A/B-tested against the pre-change code (11 fail before, 12 after, same clusters, rotating membership) and are **pre-existing flakiness**, not regressions.

## Mock draft table: mobile layout + colors (follow-up pass, same branch)

- **Mobile layout** (`MockTable.tsx`, `MockRosterEntry.tsx`): the roster table's Cost column overflowed 390px viewports (unconstrained bare player input + fixed paddings), and the Search/Estimation settings were forced into `max-w-[50%]` halves that wrapped badly. Now: the player input is a real bordered input that fills a `w-full` cell, paddings compress at mobile (`p-4 sm:p-6`, `px-1 sm:px-2`), settings stack (`flex-col sm:flex-row`), the two-card layout splits at `lg:` instead of `md:` (the static sidebar eats 12rem at md), the `md:ml-8` fixed-sidebar offset hack is gone, and the ± cost buttons grew from 12px to 20px tap targets. Zero horizontal page overflow at 390px (the players table scrolls within its own container).
- **Colors**: the green `accent` gradient budget box is now a neutral gray panel with `primary` (or red when negative) for the Remaining value; the roster player-search suggestions dropdown is a proper bordered menu (was unstyled with a `bg-slate-300` highlight); roster table headers styled to match `PlayerTable`.
- **Phantom Tailwind classes**: `PlayerTable`/`MockRosterEntry` used `gray-750`/`gray-850`, which are **not defined** in the Tailwind config — the classes silently no-op, which is why dark mode showed white alternating rows (the light `bg-gray-50` half of the pair still applied). Replaced with real tokens (`dark:bg-gray-900/40` striping, flat `dark:bg-gray-900` header). Lesson: only gray-50…900 exist; don't invent intermediate shades.
- Verified at 390×844 and 1440×900, light + dark; jest 67/67; mock-drafts e2e failures unchanged vs baseline (10 vs 11, same pre-existing clusters, none new).

## Players table responsive columns (follow-up pass, same branch)

`PlayerTable` no longer relies on undiscoverable horizontal scrolling on phones:
- Column defs (`ColumnName` object form) accept `hideBelow: 'sm' | 'md'` (CSS-only hiding — cells stay in the DOM so `player-cell-*` testids keep working) and `format` (used to render `UNRANKED` as "—").
- New `mobileSecondary` prop renders compact metadata under the player name below `sm`; MockTable uses it for "#3 overall · RB2", letting both rank columns and Platform Cost hide on phones. Mobile shows Player / Pos / $Est with zero overflow at 390px.
- Numeric columns auto right-align with `tabular-nums` (detected from the first row's value type).
- Scroll-edge fade affordances (scroll + ResizeObserver listeners, guarded for jsdom) appear only on the side with clipped content — overflow is never invisible (e.g. at 320px).

## Draft recap page: mobile layout + dark mode (follow-up pass, same branch)

`/league/[id]/drafts/[year]` had 297px of horizontal overflow at 390px and light-only styling:
- **Overflow root cause**: the league layout's `main` is a column flex container, so the page's `max-w-7xl` wrapper is a flex item whose `min-width: auto` let the ~600px chart svg force the whole ancestor chain wide. Fixed with `w-full min-w-0` on the wrapper (+ `min-w-0` on ChartContainer). Remaining 69px was the six chart tabs — `TabContainer`'s tab strip now wraps (`flex-wrap`, `px-2 sm:px-4`).
- **Chart (`PlayerScatterChart`)**: hardcoded black line/dots and white tooltip were invisible on dark. Now: Actual = primary blue, Predicted keeps purple, axes/grid use mid-gray (`#9ca3af`) readable on both schemes, tooltip/Start–End inputs are dark-aware, height is `420px` mobile / `600px` desktop via a sized wrapper + `ResponsiveContainer height="100%"`, and the controls stack above the title on phones.
- **Table**: Nominated + Drafted By hide below `sm`, shown instead as a "#3 · Ram Jam" secondary line. `PlayerTable`'s `mobileSecondary` now attaches to the first *visible non-numeric* column (it previously attached to column 0, which broke when column 0 is hidden on mobile).
- Headings/`ChartContainer` got `dark:` variants; cards use `p-4 sm:p-6`.

## Mock draft: named save resets in-progress selections (follow-up pass)

Previously, saving a New mock draft under a name left the in-progress autosave
key (`getInProgressSelectionsKey(leagueId)`) populated and still targeted, so
"New" later reloaded the already-saved selections. Now (MockTable.tsx):
- On successful named save: a `savedNameRef` retargets autosaves to the saved
  name **synchronously** (a ref, not state — a debounce timer scheduled before
  the save can fire after it and must not recreate the key); the in-progress
  key is deleted (fire-and-forget, idempotent `deleteRoster`); after ~1.2s of
  "Saved ✓" the page `router.replace`s to `/mocks/<name>`, whose prop-driven
  autosave owns persistence from then on. Save-as from a named page navigates
  to the new name; deleting the current named draft navigates back to New.
- Route-gated on `/league/<id>/mocks` — `/demo` renders MockTable with a fake
  league id and must not delete keys or navigate.
- Exported pure `resolveSaveKey(savedName, draftName, leagueId)` with unit
  tests. e2e: `shouldOverrideInProgressWithExplicitSave` now asserts
  auto-navigation + an EMPTY New page; `shouldManageMultipleDrafts` returns to
  New between drafts (it previously relied on editing in place after save).
  `shouldPersistInProgressSelections` (no explicit save) unchanged and green.
- ~~Known pre-existing gap (not fixed here): the delete-roster path doesn't
  invalidate the sidebar draft queries, so a deleted name lingers until the
  next invalidation.~~ ✅ Fixed in the stale-state pass below.

## Mock draft: stale selections on cold load / sign-in ✅ COMPLETED

Reported symptom: after a day of inactivity (or on sign-in) the mock draft page
showed selections from weeks earlier, and several recently saved mock drafts
were missing from the sidebar; more of them appeared after using the app for a
while. Two independent causes, both surfaced by the named-save reset above,
which made "in-progress key absent" the normal state rather than a rare one.

**1. Load effect ran against the anonymous adapter and never cleared state**
(`MockTable.tsx`). While `authState.loading` is true, `AuthProvider` hands out
`DexieStorageAdapter('anonymous')` (`src/lib/auth/context.tsx:67`) — a
placeholder, not the signed-in user's store. The load effect had no auth gate,
so on every cold load it:
1. read the *anonymous* IndexedDB partition and populated state with a
   long-abandoned local draft, setting `finishedLoading`;
2. re-ran when the adapter swapped to Supabase, got nothing back (the named
   save deletes the in-progress key), and — because the success branch had no
   `else` — **left the stale selections on screen**;
3. let the 500ms debounced autosave write those weeks-old selections *back into
   Supabase* under the in-progress key, recreating what step 2 should have
   cleared.

Fixed by gating the effect on `!authLoading`, resetting all four pieces of
loaded state when the authoritative read finds nothing, and adding a
`cancelled` flag so an earlier in-flight read can't clobber a newer one. The
reset callback is held in a ref so the effect deps stay
`[leagueId, draftName, storageAdapter, authLoading]` — depending on the
default-settings identities would let an unstable prop trigger a reload that
discards in-flight edits. Note `src/lib/storage/hooks.ts` still documents the
loading state as returning `MemoryStorageAdapter`; the doc describes the
intended safe behavior and the implementation had drifted from it.

**2. Transient Supabase failures silently served a stale local subset**
(`src/lib/storage/supabase.ts`). `withFallback` answers *any* failed read from
the fallback Dexie adapter with no marker, and React Query caches that as
authoritative for 2 minutes. `isRetryableError` classified both request
timeouts and JWT/token errors as **non**-retryable, so an 8s stall or an access
token that expired overnight fell through to the local subset after zero
retries — exactly the "missing drafts that show up later" symptom.

Fixed minimally, and **only for expired tokens** (`EXPIRED_TOKEN_RETRIES = 2`).
These fail fast, so the extra attempts are nearly free, and they directly cover
the reported "first load after a day idle" case. Permission denials
(RLS/authorization) remain terminal.

Retrying **request timeouts** was tried and deliberately reverted. It is
tempting for the same reason — a timeout means reachable-but-slow, so the local
fallback is likely a stale subset — but each attempt burns a full timeout
window, turning an 8s stall into ~17s before anything renders. A/B'd against
the e2e mock-draft suite it was clearly worse: **34 failed / 7 passed** with the
timeout retry vs **12 failed / 32 passed** baseline, cascading through every
spec file. The faster degraded answer wins. See the comment in
`isRetryableError` so this isn't re-introduced.

The broader issue — that a fallback result is indistinguishable from
authoritative data — is **not** addressed here.

**3. Delete path now invalidates the draft lists.** New
`useDeleteRosterMutation` (`src/hooks/queries/useDeleteRosterMutation.ts`)
mirrors `useSaveRosterMutation`'s `userDrafts` invalidation. Used for both the
explicit delete and the post-save in-progress cleanup; routing the latter
through the mutation also fixes the ordering race where a refetch could land
before the delete resolved and re-cache the row.

Verified: `type-check` and `lint` clean; Jest **67/67 suites, 770 passed, 0
failed** (running the suite in a worktree needs `.env.test.local` copied in —
`.env.local` alone is skipped by `next/jest` under `NODE_ENV=test`). The
`npm run build` OOM is pre-existing and reproduces on the parent commit.

e2e (`mock-drafts`, chromium): 11 failed / 40 passed vs a 12 failed / 32 passed
baseline on the parent commit — same clusters, rotating membership in
`budget-management`/`search-filtering`, consistent with the flakiness already
documented above. **Caveat:** the six `draft-persistence` failures are the
*Authenticated Users* block, and they fail identically before and after this
change (pre-existing setup flakes, as noted in `b5de849`). That block is
exactly where this bug lives — it needs the anonymous→Supabase adapter swap —
so the e2e run confirms *no regression* but does **not** positively validate
the fix. Fixing that setup and re-running is the outstanding verification.

## Deferred / follow-ups
- `withFallback` gives callers no way to tell a fallback result from an
  authoritative one, and `useUserDraftsQuery` caches it for 2 minutes either
  way. Consider threading a `source` flag through `StorageAdapter` so the UI
  can warn that the list may be incomplete.
- `cacheKeys.mockDrafts` is dead — no query registers a `['mockDrafts', ...]`
  key (`useMockDraftsQuery` reuses `userDrafts`), so the second invalidation
  block in `useSaveRosterMutation` matches nothing. Harmless today.
- `useUserDraftsQuery` imports `isInProgressSelectionsKey` but never uses it;
  only the sidebar filters the in-progress pseudo-draft, so it still counts
  toward `useDraftsQuery` totals.
- The `AuthProvider` watchdog degrades to the *anonymous* adapter after 5s with
  `loading: false`, which re-enables every `!authLoading`-gated query against
  the wrong store. Nothing clears the React Query cache on auth transitions,
  and `QueryProvider` sits outside `AuthProvider` with a module-level singleton
  client.
- Polish `SearchSettings`/`EstimationSettings` internals (bare unstyled h3s/checkboxes).
- Stabilize the `e2e/tests/mock-drafts` suite (same 3s-expect-timeout and ambiguous-locator problems fixed in the ESPN spec, plus a dev-overlay `Console Error` from `AuthContext getSession` tripping `/error/i` assertions).
- Adopt `PageShell`/`AppHeader` on settings + demo pages.
- Confirm prod Postgres major version and reconcile with `supabase/config.toml` (`major_version` now 17 to match the local volume).
- The main checkout's `config.toml` still says `major_version = 15` until this branch merges — `supabase start` from there will fail against the PG 17 volume.
- Branding: public name is "Know Your League" but UI intentionally keeps "Draft Builder" for now (decision 2026-07-20).
