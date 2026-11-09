-- REVIEW PROPOSAL ONLY. Not a migration; do not execute/deploy automatically.
-- Requires independent SQL/ACL review before any future migration is created.
-- Diagnostic enrollment is NOT wallet ownership, eligibility, or authority.

BEGIN;

CREATE TABLE public.economic_protocol_candidates (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  diagnostic_state text NOT NULL
    CHECK (diagnostic_state IN ('candidate', 'incomplete')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.economic_protocol_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.economic_protocol_candidates FORCE ROW LEVEL SECURITY;

-- Undo ambient/default grants explicitly, including the service Data API role.
-- Only a privileged SQL operator can provision diagnostic fixture rows.
REVOKE ALL ON TABLE public.economic_protocol_candidates FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.economic_protocol_candidates TO authenticated;

CREATE POLICY economic_protocol_candidates_read_own
ON public.economic_protocol_candidates FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = user_id);

CREATE FUNCTION public.get_economic_protocol_gate_v1()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
SET search_path = pg_catalog
AS $gate$
DECLARE
  current_uid uuid := auth.uid();
  observed_state text;
BEGIN
  IF current_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT c.diagnostic_state INTO observed_state
  FROM public.economic_protocol_candidates AS c
  WHERE c.user_id = current_uid;

  RETURN pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'protocol_state', CASE WHEN observed_state = 'incomplete' THEN 'unresolved' ELSE 'legacy' END,
    'diagnostic_state', COALESCE(observed_state, 'absent'),
    'economic_authority_enabled', false
  );
END;
$gate$;

REVOKE ALL ON FUNCTION public.get_economic_protocol_gate_v1() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_economic_protocol_gate_v1() TO authenticated;

COMMENT ON TABLE public.economic_protocol_candidates IS
  'INERT diagnostic candidates only. No balance, baseline, entitlement or activation state.';
COMMENT ON FUNCTION public.get_economic_protocol_gate_v1() IS
  'Read-only own-account protocol observation. Economic authority is always false.';

COMMIT;
