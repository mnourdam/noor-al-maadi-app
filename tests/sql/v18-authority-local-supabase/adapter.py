"""Reviewed transformations for a disposable local stack, never a migration.

Caller MUST independently verify fresh CLI project, Docker identity and loopback
endpoints before executing the returned single transaction. No network or SQL is
executed by this module. Original engine SQL remains byte-identical.
"""
import hashlib

ENGINE_SHA256 = "236b2f313ecf1861d54ae07ad18dd4c297a27b853b32f70637d536e1f2fd19f8"
OLD_GUARD = """DO $$ BEGIN
  IF current_database() <> 'v18_authority_fixture' OR to_regclass('fixture_boundary.marker') IS NULL THEN
    RAISE EXCEPTION 'prototype:wrong-disposable-database';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM fixture_boundary.marker WHERE marker = 'v18-authority-disposable-fixture-only-v1') THEN
    RAISE EXCEPTION 'prototype:missing-fixture-marker';
  END IF;
END $$;"""
NEW_GUARD = """DO $$ BEGIN
  IF current_database()<>'postgres' OR NOT (
    (inet_server_port() IS NOT DISTINCT FROM 5432 AND inet_client_addr() IS NOT NULL)
    OR (inet_server_port() IS NULL AND inet_client_addr() IS NULL
        AND session_user='supabase_admin' AND current_user='supabase_admin'
        AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname=current_user AND rolsuper))
  ) OR to_regclass('fixture_boundary.marker') IS NULL THEN
    RAISE EXCEPTION 'adapter:wrong-disposable-database';
  END IF;
  IF (SELECT count(*) FROM fixture_boundary.marker)<>1 OR NOT EXISTS(
    SELECT 1 FROM fixture_boundary.marker WHERE marker='v18-authority-local-supabase-only-v1') THEN
    RAISE EXCEPTION 'adapter:missing-fixture-marker';
  END IF;
  IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(
    SELECT 1 FROM pg_namespace WHERE nspname IN ('v18_proto_private','v18_proto_api')) THEN
    RAISE EXCEPTION 'adapter:not-fresh';
  END IF;
END $$;"""
OLD_EXTENSION = "CREATE EXTENSION pgcrypto WITH SCHEMA v18_proto_private;"
NEW_EXTENSION = """DO $$ BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_depend d ON d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e'
    JOIN pg_extension e ON d.refclassid='pg_extension'::regclass AND d.refobjid=e.oid
    WHERE n.nspname='extensions' AND e.extname='pgcrypto' AND e.extnamespace=n.oid
      AND p.oid=to_regprocedure('extensions.digest(bytea,text)')
      AND p.prorettype='bytea'::regtype AND p.prokind='f' AND NOT p.prosecdef
  ) THEN RAISE EXCEPTION 'adapter:unexpected-pgcrypto'; END IF;
END $$;
CREATE FUNCTION v18_proto_private.digest(bytea,text) RETURNS bytea
LANGUAGE sql IMMUTABLE STRICT SECURITY INVOKER SET search_path=pg_catalog
AS 'SELECT extensions.digest($1,$2)';
ALTER FUNCTION v18_proto_private.digest(bytea,text) OWNER TO v18_proto_issuer;
GRANT USAGE ON SCHEMA extensions TO v18_proto_issuer;
GRANT EXECUTE ON FUNCTION extensions.digest(bytea,text) TO v18_proto_issuer;"""

ADAPTER = """
-- Replace only the private fixture helper, NEVER Supabase auth.uid().
CREATE OR REPLACE FUNCTION v18_proto_private.fixture_subject() RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE subject uuid:=auth.uid();
BEGIN
  IF subject IS NULL THEN RAISE EXCEPTION 'prototype:unauthenticated'; END IF;
  RETURN subject;
END $$;
ALTER FUNCTION v18_proto_private.fixture_subject() OWNER TO v18_proto_executor;
GRANT USAGE ON SCHEMA auth TO v18_proto_executor;
GRANT EXECUTE ON FUNCTION auth.uid() TO v18_proto_executor;
-- Supabase creator defaults can survive ALTER OWNER. Strip actual-role ACLs.
REVOKE ALL ON SCHEMA v18_proto_private,v18_proto_api FROM PUBLIC,anon,authenticated,service_role,v18_proto_authenticated,v18_proto_anon,v18_proto_service;
REVOKE ALL ON ALL TABLES IN SCHEMA v18_proto_private,v18_proto_api FROM PUBLIC,anon,authenticated,service_role,v18_proto_authenticated,v18_proto_anon,v18_proto_service;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA v18_proto_private,v18_proto_api FROM PUBLIC,anon,authenticated,service_role,v18_proto_authenticated,v18_proto_anon,v18_proto_service;
-- New tables have no column ACLs; caller MUST assert effective column privileges.
GRANT USAGE ON SCHEMA v18_proto_api TO authenticated;
GRANT EXECUTE ON FUNCTION v18_proto_api.bootstrap(uuid),v18_proto_api.apply_fact(uuid,uuid,bigint) TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE v18_proto_issuer REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE v18_proto_executor REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE v18_proto_issuer REVOKE ALL ON FUNCTIONS FROM PUBLIC,anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE v18_proto_executor REVOKE ALL ON FUNCTIONS FROM PUBLIC,anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA v18_proto_private,v18_proto_api REVOKE ALL ON TABLES FROM PUBLIC,anon,authenticated,service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA v18_proto_private,v18_proto_api REVOKE ALL ON FUNCTIONS FROM PUBLIC,anon,authenticated,service_role;
DO $$ BEGIN
  IF (SELECT definition FROM pg_temp.authority_auth_uid_before) IS DISTINCT FROM pg_get_functiondef('auth.uid()'::regprocedure) THEN
    RAISE EXCEPTION 'adapter:auth-uid-changed';
  END IF;
  IF NOT has_schema_privilege('v18_proto_issuer','extensions','USAGE') OR NOT
     has_function_privilege('v18_proto_issuer','extensions.digest(bytea,text)','EXECUTE') THEN
    RAISE EXCEPTION 'adapter:digest-unavailable';
  END IF;
END $$;
"""


def build(engine: bytes):
    if hashlib.sha256(engine).hexdigest() != ENGINE_SHA256:
        raise ValueError("unreviewed engine source hash")
    text = engine.decode('utf-8')
    for before, after in ((OLD_GUARD, NEW_GUARD), (OLD_EXTENSION, NEW_EXTENSION)):
        if text.count(before) != 1:
            raise ValueError("reviewed transformation count mismatch")
        text = text.replace(before, after, 1)
    transaction = ("BEGIN;\nCREATE TEMP TABLE authority_auth_uid_before ON COMMIT DROP AS "
                   "SELECT pg_get_functiondef('auth.uid()'::regprocedure) AS definition;\n"
                   + text + ADAPTER + "\nCOMMIT;\n")
    return transaction, {
        "engine_sha256": ENGINE_SHA256,
        "transformed_engine_sha256": hashlib.sha256(text.encode()).hexdigest(),
        "adapter_sha256": hashlib.sha256(ADAPTER.encode()).hexdigest(),
        "transaction_sha256": hashlib.sha256(transaction.encode()).hexdigest(),
        "exact_transformations": ["disposable_database_guard", "existing_pgcrypto_facade"],
    }
