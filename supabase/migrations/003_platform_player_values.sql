-- Platform Player Values Migration
-- Global reference table holding fantasy platforms' preseason player valuations
-- (editorial ranks + auction values), scraped from ESPN draft-kit cheat sheets
-- (frozen preseason artifacts) and dated snapshots of the ESPN fantasy API.
-- Used by the live-draft backtest so models are tested against the same
-- platform inputs a real draft room shows.

CREATE TABLE platform_player_values (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    platform TEXT NOT NULL DEFAULT 'espn' CHECK (platform IN ('espn', 'sleeper')),
    season TEXT NOT NULL, -- e.g. '2023'
    snapshot_date DATE NOT NULL, -- kit publication (~Sep 1) for PDFs; run date for API snapshots
    source TEXT NOT NULL CHECK (source IN ('draft_kit_pdf', 'api')),
    rank_type TEXT NOT NULL DEFAULT 'PPR' CHECK (rank_type IN ('PPR', 'SUPERFLEX')),
    player_id TEXT, -- platform player ID once resolved; NULL when name matching failed
    player_name TEXT NOT NULL,
    team TEXT,
    position TEXT NOT NULL,
    overall_rank INTEGER,
    position_rank INTEGER,
    auction_value INTEGER, -- platform baseline dollars (ESPN: 10-team/$200 league)
    bye_week INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(platform, season, snapshot_date, source, rank_type, player_name)
);

-- Primary read pattern: all values for a platform/season at (or nearest before) a date
CREATE INDEX idx_platform_player_values_lookup
    ON platform_player_values(platform, season, rank_type, snapshot_date);
CREATE INDEX idx_platform_player_values_player
    ON platform_player_values(platform, player_id);

-- RLS: world-readable reference data; writes only via the service-role key
-- (which bypasses RLS), mirroring the server-route pattern used for league saves.
ALTER TABLE platform_player_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform player values are readable by everyone"
    ON platform_player_values FOR SELECT
    USING (true);

COMMENT ON TABLE platform_player_values IS 'Preseason platform player valuations (ranks + auction values) per season, from draft-kit PDFs and dated API snapshots';
COMMENT ON COLUMN platform_player_values.snapshot_date IS 'When these values were current; API values drift in-season, so backtests should use the snapshot nearest the league''s draft date';
COMMENT ON COLUMN platform_player_values.auction_value IS 'Platform editorial auction value in its baseline configuration (ESPN: 10 teams, $200); draft rooms scale this by a per-league constant';
COMMENT ON COLUMN platform_player_values.player_id IS 'Platform player ID resolved by name+position matching at ingest; NULL rows are kept for manual resolution';
