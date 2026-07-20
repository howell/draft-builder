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
- e2e `auth` + `platform-integration` (chromium): 9 passed; 21 failures are **pre-existing infra issues**, not UI: 20 × `users_pkey` duplicate-key (test helpers insert `public.users` rows that now collide with the auto-create trigger from commit `17c0a21`), 1 × signup-confirmation (Supabase verify link 303s straight to `/`, never reaching `/auth/callback` — local auth config/email template issue). UI flows those tests cover were verified manually in the browser instead.

## Deferred / follow-ups
- Adopt `PageShell`/`AppHeader` on settings + demo pages.
- Fix e2e test-user seeding to work with the `public.users` auto-create trigger.
- Fix local Supabase confirmation-link redirect to `/auth/callback`.
- Branding: public name is "Know Your League" but UI intentionally keeps "Draft Builder" for now (decision 2026-07-20).
