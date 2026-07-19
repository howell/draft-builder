-- Draft Builder Database Schema for Supabase Migration
-- This schema represents the migration from localStorage to Supabase persistence

-- ID generation uses gen_random_uuid() (Postgres 13+ core) — no extension
-- needed, and unlike uuid-ossp it resolves identically on local and hosted
-- Supabase, where preinstalled extensions live in the `extensions` schema.

-- Users table for authentication (Supabase Auth integration)
CREATE TABLE users (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Leagues table - stores user's league configurations
CREATE TABLE leagues (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    league_id TEXT NOT NULL, -- Platform league ID (ESPN/Sleeper/Yahoo)
    platform TEXT NOT NULL CHECK (platform IN ('espn', 'sleeper')), -- Yahoo planned for future
    auth_data_encrypted TEXT, -- Encrypted auth data (ESPN cookies, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, league_id, platform)
);

-- Draft sessions table - represents individual mock drafts
CREATE TABLE draft_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- User-provided draft name
    year TEXT NOT NULL, -- Season year
    notes TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, league_id, name)
);

-- Draft settings table - estimation and search settings per draft
CREATE TABLE draft_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    draft_session_id UUID REFERENCES draft_sessions(id) ON DELETE CASCADE UNIQUE,
    estimation_years TEXT[], -- Array of season years for estimation
    estimation_weight NUMERIC DEFAULT 0.5,
    search_positions TEXT[], -- Filtered positions
    search_player_count INTEGER DEFAULT 50,
    search_min_price NUMERIC DEFAULT 0,
    search_max_price NUMERIC DEFAULT 999,
    search_show_only_available BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Player selections table - tracks roster selections in drafts
CREATE TABLE player_selections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    draft_session_id UUID REFERENCES draft_sessions(id) ON DELETE CASCADE,
    roster_position TEXT NOT NULL, -- e.g., "QB-1", "RB-2", "FLEX-1"
    player_id TEXT NOT NULL, -- Platform player ID
    player_name TEXT NOT NULL,
    default_position TEXT NOT NULL,
    positions TEXT[], -- Array of eligible positions
    estimated_cost NUMERIC,
    overall_rank INTEGER,
    position_rank INTEGER,
    selected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(draft_session_id, roster_position)
);

-- Cost adjustments table - user-defined cost overrides
CREATE TABLE cost_adjustments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    draft_session_id UUID REFERENCES draft_sessions(id) ON DELETE CASCADE,
    roster_position TEXT NOT NULL, -- e.g., "QB-1", "RB-2", "FLEX-1" (same as player_selections)
    player_id TEXT NOT NULL, -- Platform player ID (kept for reference)
    adjusted_cost NUMERIC NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(draft_session_id, roster_position)
);

-- In-progress selections table - temporary state during active drafting
CREATE TABLE in_progress_selections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    session_data JSONB NOT NULL, -- Temporary draft state
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, league_id)
);

-- Indexes for performance
CREATE INDEX idx_leagues_user_id ON leagues(user_id);
CREATE INDEX idx_leagues_platform_league_id ON leagues(platform, league_id);
CREATE INDEX idx_leagues_user_platform_league ON leagues(user_id, platform, league_id);
CREATE INDEX idx_draft_sessions_user_league ON draft_sessions(user_id, league_id);
CREATE INDEX idx_draft_sessions_year ON draft_sessions(year);
CREATE INDEX idx_draft_sessions_user_year ON draft_sessions(user_id, year);
CREATE INDEX idx_player_selections_draft_session ON player_selections(draft_session_id);
CREATE INDEX idx_player_selections_player_id ON player_selections(player_id);
CREATE INDEX idx_player_selections_player_draft ON player_selections(player_id, draft_session_id);
CREATE INDEX idx_cost_adjustments_draft_session ON cost_adjustments(draft_session_id);
CREATE INDEX idx_in_progress_expires ON in_progress_selections(expires_at);

-- Row Level Security (RLS) policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE in_progress_selections ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can view own profile" ON users FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users can manage own leagues" ON leagues FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own draft sessions" ON draft_sessions FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own draft settings" ON draft_settings FOR ALL USING (
    auth.uid() = (SELECT user_id FROM draft_sessions WHERE id = draft_session_id)
);

CREATE POLICY "Users can manage own player selections" ON player_selections FOR ALL USING (
    auth.uid() = (SELECT user_id FROM draft_sessions WHERE id = draft_session_id)
);

CREATE POLICY "Users can manage own cost adjustments" ON cost_adjustments FOR ALL USING (
    auth.uid() = (SELECT user_id FROM draft_sessions WHERE id = draft_session_id)
);

CREATE POLICY "Users can manage own in-progress selections" ON in_progress_selections FOR ALL USING (auth.uid() = user_id);

-- Functions for cleanup and maintenance
CREATE OR REPLACE FUNCTION cleanup_expired_selections()
RETURNS void AS $$
BEGIN
    DELETE FROM in_progress_selections WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply update triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_leagues_updated_at BEFORE UPDATE ON leagues FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_draft_sessions_updated_at BEFORE UPDATE ON draft_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_draft_settings_updated_at BEFORE UPDATE ON draft_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_cost_adjustments_updated_at BEFORE UPDATE ON cost_adjustments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_in_progress_selections_updated_at BEFORE UPDATE ON in_progress_selections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column(); 