GRANT ALL ON FUNCTION public.admin_import_investigations_v2(jsonb, jsonb) TO service_role;
GRANT ALL ON FUNCTION public.admin_save_investigation_draft(uuid, jsonb, text, boolean) TO service_role;
GRANT ALL ON FUNCTION public.admin_get_investigation_full(text) TO service_role;
GRANT ALL ON FUNCTION public.is_content_editor() TO service_role;
