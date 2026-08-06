-- Grant execute permissions to the relevant roles
GRANT EXECUTE ON FUNCTION public.admin_run_import_batch(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_export_investigations() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_investigation_full(uuid) TO authenticated, service_role;

-- Ensure the sandbox user can also run it if it matches one of these roles (it usually has service_role or similar in migration context)
DO $$ 
BEGIN
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_run_import_batch(jsonb, text) TO ' || current_user;
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_export_investigations() TO ' || current_user;
END $$;
