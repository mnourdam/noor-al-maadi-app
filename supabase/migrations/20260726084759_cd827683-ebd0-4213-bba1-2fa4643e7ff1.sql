-- Guest-applicable RLS policies (games, investigations, content_registry,
-- admin_taxonomy) call is_content_editor(); guests must be able to evaluate
-- it (it simply returns false for them) or the read is denied outright.
GRANT EXECUTE ON FUNCTION public.is_content_editor() TO anon;