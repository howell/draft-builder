-- Archive Player Values Migration
-- Freezes the ranked player pool the live board was using at archive time.
-- The board's pool is built from live ESPN prices, the user's custom rankings
-- sheet, and the league price multiplier — all of which drift or get edited
-- after draft night and cannot be reconstructed later. Copying the pool into
-- the archive makes an archive a self-contained model-evaluation input
-- (picks + bids + the exact values the model priced against).
--
-- The header also gets a pointer into platform_player_values (migration 003):
-- values_snapshot_date records which dated platform snapshot was current at
-- archive time, linking the archive to the normalized cross-season backtest
-- inputs without duplicating that global reference data.

ALTER TABLE live_draft_archives
    ADD COLUMN value_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN values_snapshot_date DATE;

COMMENT ON COLUMN live_draft_archives.value_count IS 'Rows in live_draft_archive_values; 0 for archives created before values capture existed (backfillable)';
COMMENT ON COLUMN live_draft_archives.values_snapshot_date IS 'snapshot_date of the platform_player_values API snapshot that was current at archive time; NULL when unknown';

CREATE TABLE live_draft_archive_values (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    archive_id UUID NOT NULL REFERENCES live_draft_archives(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,  -- Denormalized for direct RLS
    player_id BIGINT NOT NULL,           -- ESPN id; negative for D/ST (matches archive_picks)
    player_name TEXT,                    -- Denormalized so archives are analyzable standalone
    position TEXT NOT NULL,
    overall_rank INTEGER NOT NULL,       -- Rank in the board's pool (custom rankings baked in), copied verbatim
    position_rank INTEGER NOT NULL,
    platform_value DOUBLE PRECISION,     -- League-scaled platform auction price the board displayed; NULL when the platform had none
    UNIQUE(archive_id, player_id)
);

CREATE INDEX idx_live_draft_archive_values_read
    ON live_draft_archive_values(archive_id, overall_rank);

-- RLS: direct ownership, browser-writable, mirroring the other archive tables.
ALTER TABLE live_draft_archive_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own archive values" ON live_draft_archive_values
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Explicit grants (see migrations 004/007/008): INSERT for archive creation
-- and backfill, DELETE via cascade-adjacent cleanup paths.
GRANT SELECT, INSERT, DELETE ON live_draft_archive_values TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON live_draft_archive_values TO service_role;

COMMENT ON TABLE live_draft_archive_values IS 'The ranked player pool (with values) the live board used, frozen at archive time; the model-evaluation input that live data cannot reproduce later';
