-- Synthetic PostgreSQL model, NOT the hosted Supabase schema or role graph.
\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() <> 'p105b03' THEN
  RAISE EXCEPTION 'refusing database other than disposable p105b03';
 END IF;
 IF EXISTS (SELECT FROM pg_namespace WHERE nspname='auth') THEN
  RAISE EXCEPTION 'requires a fresh synthetic database';
 END IF;
END $$;
CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE service_role NOLOGIN NOSUPERUSER BYPASSRLS;
CREATE SCHEMA auth;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
SET search_path=pg_catalog AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
REVOKE ALL ON FUNCTION auth.uid() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
CREATE TABLE auth.users(id uuid PRIMARY KEY, fixture_name text NOT NULL);
INSERT INTO auth.users VALUES
 ('11111111-1111-4111-8111-111111111111','Alice'),
 ('22222222-2222-4222-8222-222222222222','Bob'),
 ('33333333-3333-4333-8333-333333333333','V17'),
 ('44444444-4444-4444-8444-444444444444','new');
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users, xp integer, dinars integer, hearts integer, legacy_payload jsonb);
INSERT INTO public.profiles SELECT id,17,23,3,jsonb_build_object('fixture',fixture_name,'legacy_unknown',true) FROM auth.users;
CREATE TABLE public.applied_profile_deltas(delta_id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users,payload jsonb);
INSERT INTO public.applied_profile_deltas VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','{"synthetic_existing":true}');
CREATE TABLE public.cloud_saves(user_id uuid PRIMARY KEY REFERENCES auth.users,payload jsonb);
INSERT INTO public.cloud_saves SELECT id,jsonb_build_object('fixture',fixture_name,'v17_bytes','preserve') FROM auth.users;
-- Deliberately model ambient grants; the proposal must revoke them.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
CREATE SCHEMA gate_test_evidence;
REVOKE ALL ON SCHEMA gate_test_evidence FROM PUBLIC;
CREATE TABLE gate_test_evidence.before_proposal AS SELECT
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.profiles p) profiles,
 (SELECT jsonb_agg(to_jsonb(d) ORDER BY delta_id) FROM public.applied_profile_deltas d) deltas,
 (SELECT jsonb_agg(to_jsonb(c) ORDER BY user_id) FROM public.cloud_saves c) cloud;
