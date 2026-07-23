REVOKE EXECUTE ON FUNCTION public.list_moderator_queue_v2(TEXT, TIMESTAMPTZ, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_comment_reports_v2(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_moderation_history_v2(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_contribution_queue_v2(TEXT, TEXT, INT) FROM anon;

GRANT EXECUTE ON FUNCTION public.list_moderator_queue_v2(TEXT, TIMESTAMPTZ, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_moderator_queue_v2(TEXT, TIMESTAMPTZ, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_comment_reports_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_comment_reports_v2(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_moderation_history_v2(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_moderation_history_v2(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_contribution_queue_v2(TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_contribution_queue_v2(TEXT, TEXT, INT) TO service_role;