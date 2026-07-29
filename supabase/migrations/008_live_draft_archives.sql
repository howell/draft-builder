-- Live Draft Archives Migration
-- Post-draft snapshots of ingested draft-room traffic (see migration 007):
-- an archive header, a raw frame copy, and parsed pick/bid rows for SQL
-- analysis of auction dynamics. Archives are created client-side under RLS
-- at archive time; the hot ingest path (live_draft_frames) is untouched.
-- (The live_drafts/live_draft_picks/live_draft_teams tables from migration
-- 002 are unrelated legacy — do not confuse them with these.)

CREATE TABLE live_draft_archives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    league_id TEXT NOT NULL,  -- Platform league id (ESPN), matches live_draft_frames.league_id
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('real', 'test')),
    season TEXT NOT NULL,
    -- 'pending' until every child row is copied; the archiving flow flips to
    -- 'complete' before deleting the source buffer (last step commits).
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete')),
    drafted_at TIMESTAMPTZ,   -- Earliest frame ts; client-reported, analytical only
    frame_count INTEGER NOT NULL DEFAULT 0,
    capture_count INTEGER NOT NULL DEFAULT 0,
    pick_count INTEGER NOT NULL DEFAULT 0,
    bid_count INTEGER NOT NULL DEFAULT 0,
    total_spent INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, league_id, name)
);

CREATE TABLE live_draft_archive_frames (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    archive_id UUID NOT NULL REFERENCES live_draft_archives(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- Denormalized for direct RLS
    source_frame_id BIGINT NOT NULL,  -- Original live_draft_frames.id: capture ordering + watermark provenance
    capture_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    ts TIMESTAMPTZ NOT NULL,
    dir TEXT NOT NULL CHECK (dir IN ('send', 'receive')),
    data TEXT NOT NULL,
    UNIQUE(archive_id, capture_id, seq)
);

CREATE INDEX idx_live_draft_archive_frames_read
    ON live_draft_archive_frames(archive_id, source_frame_id);

CREATE TABLE live_draft_archive_picks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    archive_id UUID NOT NULL REFERENCES live_draft_archives(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pick_number INTEGER NOT NULL,
    team_id BIGINT NOT NULL,
    player_id BIGINT NOT NULL,   -- ESPN id; negative for D/ST
    player_name TEXT,            -- Denormalized at archive time so archives are analyzable standalone
    position TEXT,
    price INTEGER NOT NULL,
    nominating_team_id BIGINT,   -- From lot reconstruction; NULL when the lot was never observed live
    observed_bid_count INTEGER,  -- Bids observed for this lot; NULL when unobserved (INIT-only pick)
    distinct_bidders INTEGER,
    sold_at_ms BIGINT,           -- Capture-time epoch ms of the SOLD frame; NULL for INIT-only
    UNIQUE(archive_id, pick_number),
    UNIQUE(archive_id, player_id)  -- A player sells once; makes bids<->picks joins clean
);

CREATE INDEX idx_live_draft_archive_picks_read
    ON live_draft_archive_picks(archive_id, pick_number);

-- One row per observed auction event within a lot, in lot order. kind:
--   'open' — the nominator's opening bid (may be synthesized from CLOCK when
--            every observing capture joined mid-lot)
--   'bid'  — a competitive bid (BID frame)
--   'pass' — a PASSED frame (team dropped out; amount is NULL)
-- Unsold lots (nomination never hammered) keep their rows: LEFT JOIN
-- live_draft_archive_picks USING (archive_id, player_id) to separate them.
CREATE TABLE live_draft_archive_bids (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    archive_id UUID NOT NULL REFERENCES live_draft_archives(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player_id BIGINT NOT NULL,
    seq INTEGER NOT NULL,        -- 0-based event order within the lot (bids and passes interleaved)
    kind TEXT NOT NULL CHECK (kind IN ('open', 'bid', 'pass')),
    team_id BIGINT NOT NULL,
    amount INTEGER,              -- NULL for 'pass'
    at_ms BIGINT,                -- Capture-time epoch ms; client-reported, untrusted
    UNIQUE(archive_id, player_id, seq)
);

CREATE INDEX idx_live_draft_archive_bids_read
    ON live_draft_archive_bids(archive_id, player_id, seq);

-- RLS: direct ownership, browser-writable (archive creation runs client-side).
ALTER TABLE live_draft_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_draft_archive_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_draft_archive_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_draft_archive_bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own live draft archives" ON live_draft_archives
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own archive frames" ON live_draft_archive_frames
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own archive picks" ON live_draft_archive_picks
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can manage own archive bids" ON live_draft_archive_bids
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Table-level grants for the PostgREST API roles. Newer Supabase CLI no longer
-- auto-grants DML to anon/authenticated/service_role on tables created by the
-- `postgres` migration role, so these must be explicit (see migrations 004/007).
-- UPDATE only where needed: rename / status flip on the header.
GRANT SELECT, INSERT, UPDATE, DELETE ON live_draft_archives TO authenticated;
GRANT SELECT, INSERT, DELETE ON live_draft_archive_frames TO authenticated;
GRANT SELECT, INSERT, DELETE ON live_draft_archive_picks TO authenticated;
GRANT SELECT, INSERT, DELETE ON live_draft_archive_bids TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON
    live_draft_archives, live_draft_archive_frames,
    live_draft_archive_picks, live_draft_archive_bids
TO service_role;

CREATE TRIGGER update_live_draft_archives_updated_at
    BEFORE UPDATE ON live_draft_archives
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE live_draft_archives IS 'Named post-draft snapshot header; status=pending until all child rows are copied';
COMMENT ON TABLE live_draft_archive_frames IS 'Raw frame copy of an archived draft; ordering by source_frame_id reproduces the live fold';
COMMENT ON TABLE live_draft_archive_picks IS 'Parsed completed picks, denormalized for standalone SQL analysis';
COMMENT ON TABLE live_draft_archive_bids IS 'Per-lot auction events (open/bid/pass) after cross-capture dedup; unsold lots included';
COMMENT ON COLUMN live_draft_archive_bids.seq IS '0-based event order within the lot, bids and passes interleaved';
