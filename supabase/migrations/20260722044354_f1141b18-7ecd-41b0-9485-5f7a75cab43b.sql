
REVOKE EXECUTE ON FUNCTION public.record_tutorial_completion(TEXT, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tutorial_completion(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_campaign_progress_v2(TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_my_campaign_completions() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_onboarding_updated_at() FROM PUBLIC;
