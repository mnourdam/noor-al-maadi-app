"""Hash-pinned actual-source extraction. Pure builder: never executes SQL."""
import hashlib
import re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
SOURCES = {
 'completion': ('20260718134245_94f5a894-96f3-4133-816c-ef8e1c63cf5e.sql','31033184795f34553cac103823f5cc7d49b7192bd9e39cec836c246b2d5efcbc'),
 'progress': ('20260718124131_67ca98ae-8f01-486b-8c4b-c5175ed80e42.sql','699c0c62ea1ef9642010e07f876c71bf71b92385c1f31015bad5b90b293afbf6'),
 'delta': ('20260711073913_7b89dce5-3fe2-4a7a-b135-4ad9b7855c64.sql','717712c7e947ace5a581337c2cac827518b215bd09c9f2c3ea8f46f4dff4c5c9'),
}
START = 'CREATE OR REPLACE FUNCTION public.complete_investigation_v2('
END = '\n-- 4. Legacy backfill:'
PRELUDE = """
DO $$ BEGIN
 IF current_database()<>'v18_investigation_fixture' OR
    to_regclass('fixture_boundary.marker') IS NULL THEN
   RAISE EXCEPTION 'fixture:wrong-database';
 END IF;
 IF (SELECT count(*) FROM fixture_boundary.marker)<>1 OR NOT EXISTS(
   SELECT 1 FROM fixture_boundary.marker WHERE marker='v18-investigation-provenance-only-v1') THEN
   RAISE EXCEPTION 'fixture:missing-marker';
 END IF;
END $$;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE service_role NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
-- Explicit SQL owner-binding fixture, NOT JWT authentication.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth,public TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
CREATE TABLE public.profiles(id uuid PRIMARY KEY REFERENCES auth.users,
 xp integer NOT NULL, dinars integer NOT NULL, hearts integer NOT NULL,last_active timestamptz);
CREATE TABLE public.investigations(id uuid PRIMARY KEY,slug text UNIQUE,enabled boolean NOT NULL,reward jsonb);
CREATE TABLE public.user_collection(user_id uuid REFERENCES auth.users,item_id text,item_type text,
 PRIMARY KEY(user_id,item_id));
"""


def assert_latest_definition(directory):
    latest = SOURCES['completion'][0]
    pattern = r'(?is)\b(?:create\s+(?:or\s+replace\s+)?|alter\s+|drop\s+)function\s+(?:"?public"?\s*\.\s*)?"?complete_investigation_v2"?\s*\('
    for path in directory.glob('*.sql'):
        if path.name > latest and re.search(pattern, path.read_text()):
            raise ValueError('later completion definition requires renewed review')


def build(contents=None):
    if contents is None:
        assert_latest_definition(ROOT/'supabase/migrations')
    texts = {}
    evidence = {}
    for name, (filename, expected) in SOURCES.items():
        data = (ROOT/'supabase/migrations'/filename).read_bytes() if contents is None else contents[name]
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError('unreviewed migration source: '+name)
        texts[name] = data.decode()
        evidence[name] = {'file': filename, 'sha256': expected}
    if texts['completion'].count(START)!=1 or texts['completion'].count(END)!=1 or texts['progress'].count(START)!=1:
        raise ValueError('source extraction boundaries changed')
    completion = texts['completion'].split(START)[1].split(END)[0]
    completion = START + completion
    progress = texts['progress'].split(START)[0]
    # Snapshot column is the exact additive statement from the latest migration.
    column = "ALTER TABLE public.user_investigation_progress\n  ADD COLUMN IF NOT EXISTS reward_snapshot JSONB;"
    if texts['completion'].count(column)!=1:
        raise ValueError('snapshot declaration changed')
    sql = 'BEGIN;\n'+PRELUDE+progress+column+'\n'+texts['delta']+'\n'+completion+'\nCOMMIT;\n'
    evidence['extracted_completion_sha256'] = hashlib.sha256(completion.encode()).hexdigest()
    evidence['fixture_sha256'] = hashlib.sha256(sql.encode()).hexdigest()
    return sql,evidence
