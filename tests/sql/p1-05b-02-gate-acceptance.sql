-- Prepared in P1-05B-02; executed only by the disposable P1-05B-03 harness.
-- For the disposable synthetic PostgreSQL harness; hosted integration requires separate approval.
-- Apply/review docs/proposals/v18-01a-p1-05b-02-compatibility-gate.sql separately.
-- Requires four synthetic auth.users (and normal profile fixture rows):
-- 111... Alice, 222... Bob, 333... existing V17, 444... newly registered.
-- Never run against a live/player database. All test rows roll back.
\set ON_ERROR_STOP on
BEGIN;

DO $test$
BEGIN
  IF (SELECT count(*) FROM auth.users WHERE id IN (
    '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'
  )) <> 4 THEN RAISE EXCEPTION 'isolated synthetic fixture users are required'; END IF;
  IF EXISTS (SELECT 1 FROM public.economic_protocol_candidates WHERE user_id IN (
    '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'
  )) THEN RAISE EXCEPTION 'fixture enrollment must initially be absent'; END IF;
END;
$test$;

CREATE TEMP TABLE gate_economy_before AS SELECT
  (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.profiles p) AS profiles,
  (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.delta_id) FROM public.applied_profile_deltas d) AS deltas,
  (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.user_id) FROM public.cloud_saves c) AS cloud;

-- Missing enrollment means legacy for BOTH an old and a new account.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
DO $test$
BEGIN
  IF public.get_economic_protocol_gate_v1() IS DISTINCT FROM
    '{"schema_version":1,"protocol_state":"legacy","diagnostic_state":"absent","economic_authority_enabled":false}'::jsonb
  THEN RAISE EXCEPTION 'V17 absence must remain inert legacy'; END IF;
END;
$test$;
SELECT set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
DO $test$
BEGIN
  IF public.get_economic_protocol_gate_v1() IS DISTINCT FROM
    '{"schema_version":1,"protocol_state":"legacy","diagnostic_state":"absent","economic_authority_enabled":false}'::jsonb
  THEN RAISE EXCEPTION 'new account absence must remain inert legacy'; END IF;
END;
$test$;
RESET ROLE;

-- Provision diagnostics as the privileged fixture operator, never through an API.
INSERT INTO public.economic_protocol_candidates(user_id, diagnostic_state) VALUES
  ('11111111-1111-4111-8111-111111111111', 'candidate'),
  ('22222222-2222-4222-8222-222222222222', 'incomplete');
DO $test$
BEGIN
  BEGIN
    INSERT INTO public.economic_protocol_candidates(user_id, diagnostic_state)
    VALUES ('33333333-3333-4333-8333-333333333333', 'authoritative');
    RAISE EXCEPTION 'authoritative state was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF has_table_privilege('authenticated', 'public.economic_protocol_candidates', 'INSERT') OR
     has_table_privilege('authenticated', 'public.economic_protocol_candidates', 'UPDATE') OR
     has_table_privilege('authenticated', 'public.economic_protocol_candidates', 'DELETE') OR
     has_table_privilege('service_role', 'public.economic_protocol_candidates', 'INSERT') OR
     has_table_privilege('service_role', 'public.economic_protocol_candidates', 'UPDATE') OR
     has_table_privilege('service_role', 'public.economic_protocol_candidates', 'DELETE') OR
     has_function_privilege('anon', 'public.get_economic_protocol_gate_v1()', 'EXECUTE') OR
     has_function_privilege('service_role', 'public.get_economic_protocol_gate_v1()', 'EXECUTE')
  THEN RAISE EXCEPTION 'unexpected write/execute privilege'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = 'public.economic_protocol_candidates'::regclass
    AND relrowsecurity AND relforcerowsecurity)
  THEN RAISE EXCEPTION 'RLS is not enabled/forced'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.get_economic_protocol_gate_v1()'::regprocedure
    AND NOT prosecdef AND provolatile = 's' AND pronargs = 0
    AND 'search_path=pg_catalog' = ANY(proconfig))
  THEN RAISE EXCEPTION 'RPC properties differ from reviewed contract'; END IF;
END;
$test$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
DO $test$
BEGIN
  IF current_user <> 'authenticated' OR
     (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) OR
     NOT has_schema_privilege(current_user,'public','USAGE') OR
     NOT has_schema_privilege(current_user,'auth','USAGE') OR
     NOT has_table_privilege(current_user,'public.economic_protocol_candidates','SELECT')
  THEN RAISE EXCEPTION 'user test role/USAGE/SELECT invalid'; END IF;
  IF (SELECT count(*) FROM public.economic_protocol_candidates) <> 1 OR
     EXISTS (SELECT 1 FROM public.economic_protocol_candidates
       WHERE user_id = '22222222-2222-4222-8222-222222222222')
  THEN RAISE EXCEPTION 'Alice can read Bob or has lost her own row'; END IF;
  IF public.get_economic_protocol_gate_v1() IS DISTINCT FROM
    '{"schema_version":1,"protocol_state":"legacy","diagnostic_state":"candidate","economic_authority_enabled":false}'::jsonb
  THEN RAISE EXCEPTION 'candidate acquired authority or wrong account data'; END IF;
  BEGIN
    PERFORM public.get_economic_protocol_gate_v1('22222222-2222-4222-8222-222222222222'::uuid);
    RAISE EXCEPTION 'RPC accepted a destination UID';
  EXCEPTION WHEN undefined_function THEN NULL; END;
  BEGIN
    INSERT INTO public.economic_protocol_candidates(user_id, diagnostic_state)
    VALUES ('11111111-1111-4111-8111-111111111111', 'candidate');
    RAISE EXCEPTION 'authenticated INSERT succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.economic_protocol_candidates SET diagnostic_state = 'incomplete';
    RAISE EXCEPTION 'authenticated UPDATE succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.economic_protocol_candidates;
    RAISE EXCEPTION 'authenticated DELETE succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$test$;
SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
DO $test$
BEGIN
  IF current_user <> 'authenticated' OR
     (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user) OR
     (SELECT count(*) FROM public.economic_protocol_candidates) <> 1 OR
     EXISTS (SELECT 1 FROM public.economic_protocol_candidates WHERE user_id='11111111-1111-4111-8111-111111111111')
  THEN RAISE EXCEPTION 'Bob isolation/role boundary failed'; END IF;
  IF public.get_economic_protocol_gate_v1() IS DISTINCT FROM
    '{"schema_version":1,"protocol_state":"unresolved","diagnostic_state":"incomplete","economic_authority_enabled":false}'::jsonb
  THEN RAISE EXCEPTION 'incomplete evidence acquired authority'; END IF;
END;
$test$;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $test$
BEGIN
  BEGIN
    PERFORM public.get_economic_protocol_gate_v1();
    RAISE EXCEPTION 'missing UID was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$test$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
  BEGIN
    PERFORM public.get_economic_protocol_gate_v1();
    RAISE EXCEPTION 'anonymous RPC execution succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$test$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $test$ BEGIN
  BEGIN
    PERFORM public.get_economic_protocol_gate_v1();
    RAISE EXCEPTION 'service_role RPC execution succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN NULL; END;
END; $test$;
RESET ROLE;

DO $test$
BEGIN
  IF (SELECT profiles FROM gate_economy_before) IS DISTINCT FROM
       (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.profiles p) OR
     (SELECT deltas FROM gate_economy_before) IS DISTINCT FROM
       (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.delta_id) FROM public.applied_profile_deltas d) OR
     (SELECT cloud FROM gate_economy_before) IS DISTINCT FROM
       (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.user_id) FROM public.cloud_saves c)
  THEN RAISE EXCEPTION 'gate touched wallet, delta ledger or Cloud Save'; END IF;
END;
$test$;
ROLLBACK;
