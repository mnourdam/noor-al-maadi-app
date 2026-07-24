
REVOKE EXECUTE ON FUNCTION public.evaluate_unlock_spec_v2(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public._eval_unlock_node_v2(uuid, jsonb, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.normalize_unlock_spec_v2(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_unlock_spec_v2(jsonb) FROM anon;
