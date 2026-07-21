
REVOKE EXECUTE ON FUNCTION public.record_campaign_completion(text, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_campaign_completion(text, integer, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_campaign_completion(text, integer, text) TO authenticated;
