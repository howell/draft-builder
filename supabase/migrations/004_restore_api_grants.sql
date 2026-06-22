-- Restore PostgREST API-role grants on the pre-existing app tables.
--
-- Background: newer Supabase CLI versions stopped auto-granting DML to the
-- anon/authenticated/service_role roles on tables created by the `postgres`
-- migration role. Tables from migrations 001-002 were created before any
-- explicit GRANTs, so after a `supabase db reset` under a newer CLI they end
-- up with only TRUNCATE/REFERENCES/TRIGGER for these roles and NO
-- SELECT/INSERT/UPDATE/DELETE — which breaks every authenticated read/write
-- and the service-role server routes (e.g. save-league).
--
-- Row-level security still gates access: these tables keep their
-- `auth.uid() = user_id` policies, so authenticated users only reach their own
-- rows and anon reaches nothing. service_role bypasses RLS by design for the
-- server routes that need it. (platform_player_values grants its own access in
-- migration 003.)

GRANT SELECT, INSERT, UPDATE, DELETE ON
    users,
    leagues,
    draft_sessions,
    draft_settings,
    cost_adjustments,
    player_selections,
    in_progress_selections,
    live_drafts,
    live_draft_picks,
    live_draft_teams
TO anon, authenticated, service_role;
