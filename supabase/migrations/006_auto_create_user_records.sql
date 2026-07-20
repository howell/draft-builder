-- Auto-create public.users rows at signup.
--
-- Background: public.users rows were only created by a best-effort client-side
-- upsert (ensureUserRecord in the auth context), whose failures are silent.
-- When it failed (e.g. accounts confirmed before the schema existed in prod),
-- the user had no public.users row and every league save died on the
-- leagues_user_id_fkey foreign key. Create the row at the source instead: a
-- trigger on auth.users, the canonical Supabase pattern. The client upsert
-- remains as harmless belt-and-braces.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill accounts created before the trigger existed.
INSERT INTO public.users (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Every auth user now always has a public.users row, so auth-user deletion
-- (e.g. from the dashboard) must cascade through it; previously the FK had no
-- ON DELETE action and would block the delete. Downstream app tables already
-- cascade off public.users.
ALTER TABLE public.users
    DROP CONSTRAINT users_id_fkey,
    ADD CONSTRAINT users_id_fkey
        FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
