# ESPN Draft-Room Protocol & Live Data Acquisition

**Status**: Protocol decoded and validated (2026-07-19 test draft) · tooling merged on `live-draft-data` · app-side integration not started

This is the reference for how Draft Builder gets data out of an ESPN auction
draft as it happens. It documents the findings of the 2026-07-19 test-draft
experiment, the wire protocol, the decoding/capture tooling, and the remaining
integration work. The modeling side (what we *do* with this data) lives in
[implementation-plan.md](implementation-plan.md).

## 1. Where live draft data lives (and doesn't)

Two data paths were tested during a real 4-team auction (test league
390366456, season 2026):

### REST league API — completion-only ❌ live, ✅ post-draft

`GET lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/<yr>/segments/0/leagues/<id>?view=mDraftDetail`

- Before the draft, the response contains the **full pick skeleton**: one pick
  object per slot with `playerId: -1`, `bidAmount: 0`, and `nominatingTeamId`
  pre-assigned (the *scheduled* nomination order — see §4 caveats).
- `drafted:false → inProgress:true` when the room opens (~10 min before picks).
- **The view then freezes for the entire draft.** Zero incremental updates
  across 44 minutes of picks; cache-busting headers and the `mRoster` view
  don't help. All 64 picks appeared in **one atomic flush** at completion
  (`drafted: true`).
- Conclusion: polling serves **post-draft reconciliation and corpus capture
  only**. It can never drive live inflation updates.

### Draft-room WebSocket — everything, live ✅

`wss://fantasydraft.espn.com/game-1/league-<leagueId>/JOIN?1=<gameId>&2=<leagueId>&3=<teamId>&4=<SWID>`

The room streams a **plain-text, space-delimited protocol** carrying every
nomination, every individual bid (with bidder identity — the per-team appetite
signal the inflation model wants), per-second clock state, and each hammer.
This is the only live source and also the *richer* source: bid-by-bid history
is never exposed by the REST API.

A second WebSocket to `espn.connections.edge.bamgrid.com` is Disney telemetry;
ignore it.

## 2. Frame grammar

Decoder: `src/platforms/espn/liveDraftProtocol.ts` (`parseDraftSocketFrame`).
Validated against the post-draft REST flush: **price and winning team 51/51**.

```
CLOCK <phase> <msRemaining> <leadingTeamId> <playerId> <currentBid>   ~1/second
BID <teamId> <playerId> <amount> <timerMs> <msRemaining>
SOLD <teamId> <playerId> <unknown3> <price> <unknown5>
NOMINATION <teamId> <timerMs>        team is on the clock to nominate;
                                     the chosen player appears via CLOCK/BID
AUTOSUGGEST <playerId>               nomination suggestion for our team
AUTODRAFT <teamId> <bool>            server broadcast (client sends "AUTODRAFT <bool>")
PASSED <teamId> <playerId> <bool>
JOINED <teamId> {<SWID>}
TOKEN <gameId>:<leagueId>:<teamId>:{<SWID>}:<opaque>
INIT <base64 blob>                   room state snapshot on connect (§3)
STATE <n>
PING/PONG                            keepalive
```

Notes:
- The nominator's opening $1 arrives as a normal `BID` frame. When connecting
  mid-lot, that frame is missed — synthesize it from the first `CLOCK`
  (`reconstructLots` does this).
- **D/ST players have negative IDs** (e.g. -16034). Only `-1` is the
  empty/pending sentinel.
- `timerMs` is the bid-timer duration (25000 in the test league).
- `SOLD.unknown3` is NOT `lineupSlotId` (5/51 agreement ≈ chance). Unidentified.

`reconstructLots` folds an ordered event stream into per-player lots:
nominator, full bid sequence with timestamps, distinct bidders, winner, price.

## 3. INIT blob (mid-draft connect catch-up)

On connect the room sends `INIT <base64>`: a big-endian binary snapshot.
Decoder: `parseInitBlob` (same module). The decoded portion is the **pick
ledger** — the longest run of consecutive 45-byte records beginning with the
league id:

```
u32 leagueId | u32 teamId | u32 pickNumber | i32 playerId
| u32 slotIdHint | u32 price | u32 unknown | 12B unknown | 1B unknown
```

- Completed picks: real `playerId`; **player+team+price validated 13/13**
  against REST. `slotIdHint` is the room's provisional slot and differs from
  the final `lineupSlotId` on ~half of picks — do not rely on it.
- Pending slots: `playerId == -1`, `teamId` = scheduled nominating team.
- Together with the live frames this makes a mid-draft connection lossless:
  INIT supplies everything before the connect, CLOCK reveals the in-flight lot
  within a second.
- The rest of the blob (timestamps, header arrays, per-team region at 25-byte
  stride — likely rosters/budgets) is undecoded and so far unneeded.

## 4. Data-quality caveats learned the hard way

- REST `nominatingTeamId` is the **pre-draft schedule, not who actually
  nominated**. It diverges late in drafts when full-rostered teams stop
  nominating (12/51 lots in the test draft). The WS stream is ground truth.
- ESPN silently **resets the scheduled draft time if the league isn't full** —
  every team slot must be claimed by an account (dummy Disney accounts via
  gmail plus-addressing work; one-time setup, reusable). Once launched,
  autopilot runs unclaimed/absent teams.
- Key integration logic off `inProgress`/first pick, never the schedule.
- ESPN also opens the room (`inProgress: true`) minutes before picks start.

## 5. Tooling

| Tool | Purpose |
|---|---|
| `scripts/poll-draft.ts` | Poll `mDraftDetail` during/after a draft; JSONL capture of summaries + full bodies on change. Post-draft reconciliation & liveness probes. |
| `scripts/espn-draft-room-tap.user.js` | Tampermonkey userscript. Patches `WebSocket` at `document-start` on ESPN draft-room pages, records all `fantasydraft.espn.com` frames, floating badge → JSONL download, optional live forwarding (§6). |
| `scripts/parse-draft-har.ts` | Convert a DevTools HAR (`--har`) or tap capture (`--frames`) into `*.events.jsonl` + `*.lots.json`; cross-validates against a poll capture (`--rest`). |
| `src/platforms/espn/liveDraftProtocol.ts` | The decoder proper: `parseDraftSocketFrame`, `parseInitBlob`, `reconstructLots`. Jest-tested with verbatim captured frames. |

Raw captures are archived in `draft-captures/` (gitignored): the 2026-07-19
HAR + poll capture and their derived events/lots files.

Run the parser:
```
npx ts-node --project scripts/tsconfig.json scripts/parse-draft-har.ts \
  --har draft-captures/<file>.har --rest draft-captures/<file>.jsonl
```

## 6. Target draft-day workflow

**Corpus capture (works today)**: install Tampermonkey + the tap userscript
(one-time). Draft normally; click the badge afterward to download the
bid-by-bid JSONL; feed it to `parse-draft-har.ts --frames`. Replaces the
fragile DevTools/HAR export (which loses frames unless DevTools was open
before the socket connected).

**Live pipeline (ingest half built ✅, model wiring remaining)**:
1. Userscript v0.2 forwards frames in ~2s batches of ≤500 to
   `POST /api/live-draft-ingest` with a per-user bearer token. Configure in
   the draft-room tab's console (snippet shown on the live-draft page):
   `localStorage.draftBuilderIngestUrl` + `localStorage.draftBuilderIngestToken`.
2. The route (src/app/api/live-draft-ingest/) verifies the token (secret in
   `user_settings` 'app'/'liveDraftIngest', constant-time compare; `user_id`
   derives only from the token), serves CORS for the two ESPN origins, and
   upserts raw frames into `live_draft_frames` (migration 007) with
   `(user_id, capture_id, seq)` dedupe — userscript retries are idempotent.
3. The live-draft page polls via `useLiveDraftFramesQuery` (2s incremental
   id-watermark fetch under RLS). NOTE: sort by `(captureId, seq)` before
   `reconstructLots` — id order ≠ protocol order after retries. Token mint UI
   + live frame readout: `IngestSetup.tsx` on the dev-gated page.

## 7. Remaining work

- [x] **App ingest endpoint** — `/api/live-draft-ingest` (2026-07-20): token
      auth, CORS, validation, `live_draft_frames` storage, polling read hook,
      mint UI. Verified end-to-end locally (curl matrix + browser loop).
- [x] **Live-draft page consumption** (2026-07-27) — `buildLiveBoard`
      (`src/lib/models/live-draft/liveBoard.ts`) folds polled frames into
      picks/teams/current-lot state (INIT snapshot-replaces the ledger, SOLD
      updates it) and drives the calibrated inflation model on the game-day
      page (`/league/<id>/live-draft`, `LiveDraftBoard.tsx`). Post-draft
      `mDraftDetail` reconciliation remains open.
- [x] **Archive values snapshot** (2026-08-02) — migration 009
      (`live_draft_archive_values` + `value_count`/`values_snapshot_date` on
      the header): archiving freezes the board's ranked pool (custom-rankings
      order, league-scaled platform prices) alongside picks/bids, because the
      live pool drifts (ESPN values move, the rankings sheet gets edited) and
      cannot be reconstructed later. `ArchiveBoard` replays against the frozen
      pool when present and offers a one-time backfill for older archives;
      `archiveToHistoricalDraft` (`archiveExtract.ts`) turns a values-bearing
      archive into a self-contained backtest `HistoricalDraft`;
      `/api/player-values` gained `asOf` to pin API-source seasons to the
      snapshot of a given date. Follow-up closed same day: `useSimulatorData`
      folds real/complete/values-bearing archives into the historical set via
      `useArchiveHistoricalInputsQuery` (picks+values only, frames never
      fetched), archives replacing the API-history normalization for their
      season (`archiveSeasons`, marked † in the season toggles); the backtest
      report gained per-season fold buckets (`bySeason`) and a by-season MAE
      table, so an archive-backed season's held-out fold — the true
      out-of-sample score on ex-ante draft-night inputs — reads directly off
      the simulator page.
- [ ] **Dress-rehearsal test draft** with the userscript installed end-to-end
      (test league + dummy accounts make this cheap). Do this before any app
      work depends on the script.
- [ ] **Protocol unknowns** (non-blocking): `SOLD.unknown3`, INIT header/team
      regions, `STATE`/`phase` values, snake-draft frames (unobserved — all
      captures are auction).
- [ ] **Robustness**: userscript reconnect behavior, multi-tab, ESPN protocol
      drift monitoring before draft season.
- [ ] **Distribution (later, optional)**: package as a store-installable
      browser extension if anyone beyond Sam's leagues needs live mode.
