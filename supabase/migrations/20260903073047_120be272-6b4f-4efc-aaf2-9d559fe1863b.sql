REVOKE ALL ON FUNCTION public._eval_unlock_prepared_v2(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._eval_unlock_prepared_guest_v2(jsonb, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._story_unlock_leaves_v2(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._story_unlock_norm_sync_v2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._eval_unlock_prepared_v2(uuid, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public._eval_unlock_prepared_guest_v2(jsonb, boolean, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._story_unlock_leaves_v2(jsonb) TO service_role;