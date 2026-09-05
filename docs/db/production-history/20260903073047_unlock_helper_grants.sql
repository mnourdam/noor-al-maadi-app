-- HISTORICAL RECORD — NOT DEPLOYABLE, DO NOT EXECUTE.
-- Production migration version: 20260903073047
-- md5(statement) = fc7d0801512d114e0fd8c858c492e900  length = 698
-- Copied verbatim from supabase_migrations.schema_migrations on 2026-09-05.

REVOKE ALL ON FUNCTION public._eval_unlock_prepared_v2(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._eval_unlock_prepared_guest_v2(jsonb, boolean, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._story_unlock_leaves_v2(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._story_unlock_norm_sync_v2() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._eval_unlock_prepared_v2(uuid, jsonb, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public._eval_unlock_prepared_guest_v2(jsonb, boolean, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._story_unlock_leaves_v2(jsonb) TO service_role;
