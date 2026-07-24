REVOKE EXECUTE ON FUNCTION public.admin_list_story_media_orphans(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_story_media_orphans(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_story_media_orphans(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_story_media_orphans(integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_story_delete_impact(text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_story_delete_impact(text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_story_delete_impact(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_story_delete_impact(text[]) TO service_role;