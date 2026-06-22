-- User Settings Migration
-- Per-user keyed JSON settings, mirroring the client-side Dexie `userSettings`
-- table (src/lib/storage/database-schema.ts). Backs account-level preferences
-- that are not tied to a single draft, e.g. the per-league ESPN price multiplier
-- (`type='app', key='leaguePriceMultipliers'`, data = { [leagueId]: number }).

CREATE TABLE user_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('estimation', 'search', 'display', 'app')),
    key TEXT NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, type, key)
);

CREATE INDEX idx_user_settings_lookup ON user_settings(user_id, type, key);

-- RLS: each user reads/writes only their own settings.
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own settings" ON user_settings FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Table-level grants for the PostgREST API roles. Newer Supabase CLI no longer
-- auto-grants DML to anon/authenticated/service_role on tables created by the
-- `postgres` migration role, so these must be explicit. Access is still gated by
-- the RLS policy above.
GRANT SELECT, INSERT, UPDATE, DELETE ON user_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON user_settings TO service_role;

COMMENT ON TABLE user_settings IS 'Per-user keyed JSON settings (account-level preferences not tied to a single draft)';
COMMENT ON COLUMN user_settings.data IS 'Arbitrary JSON for the setting; e.g. leaguePriceMultipliers maps leagueId -> ESPN price multiplier';
