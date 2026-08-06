GRANT EXECUTE ON FUNCTION public.admin_import_investigations_v2(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_save_investigation_draft(uuid, jsonb, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_investigation_full(text) TO authenticated, service_role;
