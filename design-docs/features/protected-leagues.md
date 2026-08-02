# Protected leagues

Status: ✅ COMPLETED (2026-08-02)

Keeps league mates from using the site's tools for the owner's real league
(competitive edge), replacing the long-dead magic-word cookie (a client-side
check in `EspnLogin.tsx`, commented out and removable since it never guarded
deep links anyway).

## Design

Server-side enforcement at the only surface that matters: the six
league-carrying platform-data routes (`fetch-league`, `fetch-league-teams`,
`fetch-players`, `fetch-draft`, `fetch-league-history`, `find-league`).
Without them a league page renders nothing useful, no matter how it is
reached. Everything else league-private is already safe: live-draft ingest is
Bearer-authed, and archives/mocks/rosters sit behind RLS.

- **Gate** (`src/app/api/leagueGate.ts`): `guardProtectedLeague(req, league)`
  runs right after each route decodes its body. Leagues listed in
  `PROTECTED_LEAGUE_IDS` require a Supabase Bearer token whose verified
  email (via service-role `auth.getUser`) is in `PROTECTED_LEAGUE_EMAILS`
  (both comma-separated; emails compared case-insensitively). Denials are
  403 + `{ status: PROTECTED_LEAGUE_STATUS }`, no-store.
- **Client** (`src/app/api/utils.ts`): `makeApiRequest` attaches the
  signed-in session's access token (browser only) on every call, and on a
  gate denial hard-navigates to **`/newman.gif`** — the owner's requested
  UX for snooping league mates — via `isProtectedLeagueDenial`. The marker
  constant lives in `src/app/api/interface.ts` so the client never imports
  the server-only gate module.

## Config

Unset env vars = gate off (safe default). To arm it (Vercel + `.env.local`):

```
PROTECTED_LEAGUE_IDS=781060
PROTECTED_LEAGUE_EMAILS=samcaldwell19@gmail.com
```

Ids with no emails locks the league for everyone, owner included. The owner
must be signed in wherever the tools run — including draft night.

## Tests

`leagueGate.test.ts` (id/email matrix, case-insensitivity, no-auth and
bad-token denials, no-store), `fetch-league/__tests__/route.test.ts` (denial
returned verbatim before the platform call; 400s pre-gate; other five routes
wire identically), `utils.test.ts` (Bearer attach, signed-out no-header,
newman redirect on the marker 403 only).
