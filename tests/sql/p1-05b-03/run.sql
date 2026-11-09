-- Run ONLY in a fresh disposable PostgreSQL database named p105b03.
\set ON_ERROR_STOP on
SELECT version();
\ir fixtures.sql
\ir ../../../docs/proposals/v18-01a-p1-05b-02-compatibility-gate.sql
\ir ../p1-05b-02-gate-acceptance.sql
-- Compare to BEFORE proposal DDL, not merely the acceptance transaction snapshot.
DO $$ BEGIN
 IF (SELECT profiles FROM gate_test_evidence.before_proposal) IS DISTINCT FROM
    (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.profiles p) OR
    (SELECT deltas FROM gate_test_evidence.before_proposal) IS DISTINCT FROM
    (SELECT jsonb_agg(to_jsonb(d) ORDER BY delta_id) FROM public.applied_profile_deltas d) OR
    (SELECT cloud FROM gate_test_evidence.before_proposal) IS DISTINCT FROM
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY user_id) FROM public.cloud_saves c)
 THEN RAISE EXCEPTION 'economic evidence changed across proposal and acceptance'; END IF;
 IF EXISTS(SELECT FROM public.economic_protocol_candidates) THEN
  RAISE EXCEPTION 'acceptance fixture enrollment leaked past rollback'; END IF;
 IF (SELECT count(*) FROM pg_tables WHERE schemaname='public')<>4 THEN
  RAISE EXCEPTION 'unexpected public table, e.g. entitlement/baseline'; END IF;
END $$;
\echo 'P105B03 ENGINE ACCEPTANCE PASS; economic snapshots unchanged; NOT Supabase integration acceptance'
