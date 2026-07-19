-- Live Draft Support Migration
-- Adds dedicated tables and columns for live draft tracking functionality

-- Add draft_type column to existing draft_sessions table to distinguish mock vs live drafts
ALTER TABLE draft_sessions 
ADD COLUMN draft_type TEXT DEFAULT 'mock' CHECK (draft_type IN ('mock', 'live'));

-- Create index for draft type filtering
CREATE INDEX idx_draft_sessions_draft_type ON draft_sessions(draft_type);

-- Live drafts table - main live draft sessions
CREATE TABLE live_drafts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    draft_id TEXT NOT NULL, -- Unique draft identifier (user-friendly)
    draft_name TEXT NOT NULL,
    current_pick_number INTEGER DEFAULT 1,
    settings JSONB, -- Live draft settings (total budget, team count, roster settings, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, league_id, draft_id)
);

-- Live draft picks table - individual picks made during the draft
CREATE TABLE live_draft_picks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    live_draft_id UUID REFERENCES live_drafts(id) ON DELETE CASCADE,
    pick_number INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    team_name TEXT NOT NULL,
    player_id TEXT NOT NULL, -- Platform player ID
    player_name TEXT NOT NULL,
    player_position TEXT NOT NULL,
    price NUMERIC NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(live_draft_id, pick_number)
);

-- Live draft teams table - team information and budget tracking
CREATE TABLE live_draft_teams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    live_draft_id UUID REFERENCES live_drafts(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL,
    team_name TEXT NOT NULL,
    budget NUMERIC NOT NULL,
    remaining_budget NUMERIC NOT NULL,
    roster_slots JSONB, -- Array of roster slot definitions
    filled_positions JSONB DEFAULT '{}', -- Position -> count mapping
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(live_draft_id, team_id)
);

-- Indexes for performance
CREATE INDEX idx_live_drafts_user_id ON live_drafts(user_id);
CREATE INDEX idx_live_drafts_league_id ON live_drafts(league_id);
CREATE INDEX idx_live_drafts_user_league ON live_drafts(user_id, league_id);
CREATE INDEX idx_live_drafts_draft_id ON live_drafts(draft_id);

CREATE INDEX idx_live_draft_picks_live_draft_id ON live_draft_picks(live_draft_id);
CREATE INDEX idx_live_draft_picks_pick_number ON live_draft_picks(pick_number);
CREATE INDEX idx_live_draft_picks_team_id ON live_draft_picks(team_id);
CREATE INDEX idx_live_draft_picks_player_id ON live_draft_picks(player_id);
CREATE INDEX idx_live_draft_picks_timestamp ON live_draft_picks(timestamp);

CREATE INDEX idx_live_draft_teams_live_draft_id ON live_draft_teams(live_draft_id);
CREATE INDEX idx_live_draft_teams_team_id ON live_draft_teams(team_id);

-- Row Level Security (RLS) policies
ALTER TABLE live_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_draft_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_draft_teams ENABLE ROW LEVEL SECURITY;

-- Users can only access their own live drafts
CREATE POLICY "Users can manage own live drafts" ON live_drafts FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own live draft picks" ON live_draft_picks FOR ALL USING (
    auth.uid() = (SELECT user_id FROM live_drafts WHERE id = live_draft_id)
);

CREATE POLICY "Users can manage own live draft teams" ON live_draft_teams FOR ALL USING (
    auth.uid() = (SELECT user_id FROM live_drafts WHERE id = live_draft_id)
);

-- Add triggers for automatic timestamp updates
CREATE TRIGGER update_live_drafts_updated_at BEFORE UPDATE ON live_drafts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_live_draft_teams_updated_at BEFORE UPDATE ON live_draft_teams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE live_drafts IS 'Live draft sessions with real-time pick tracking and budget management';
COMMENT ON TABLE live_draft_picks IS 'Individual picks made during live drafts with pricing and timing';
COMMENT ON TABLE live_draft_teams IS 'Team information and budget tracking for live drafts';

COMMENT ON COLUMN live_drafts.draft_id IS 'User-friendly unique identifier for the draft (like "2024-league-draft-1")';
COMMENT ON COLUMN live_drafts.current_pick_number IS 'Next pick number to be made in the draft';
COMMENT ON COLUMN live_drafts.settings IS 'JSON object containing live draft configuration (budget, teams, roster settings)';

COMMENT ON COLUMN live_draft_picks.pick_number IS 'Sequential pick number in the draft (1-based)';
COMMENT ON COLUMN live_draft_picks.price IS 'Auction price paid for the player (in league currency)';

COMMENT ON COLUMN live_draft_teams.budget IS 'Total budget allocated to this team';
COMMENT ON COLUMN live_draft_teams.remaining_budget IS 'Budget remaining after all picks';
COMMENT ON COLUMN live_draft_teams.roster_slots IS 'JSON array of roster slot definitions for this team';
COMMENT ON COLUMN live_draft_teams.filled_positions IS 'JSON object mapping position names to counts (e.g., {"QB": 1, "RB": 2})';