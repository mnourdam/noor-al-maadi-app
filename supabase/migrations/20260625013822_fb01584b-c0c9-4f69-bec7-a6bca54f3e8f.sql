
REVOKE EXECUTE ON FUNCTION public.analytics_overview() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.analytics_content_health() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.analytics_atlas() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.analytics_system_health() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.analytics_timeseries(text, timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.analytics_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_content_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_atlas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_system_health() TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_timeseries(text, timestamptz, timestamptz, text) TO authenticated;
