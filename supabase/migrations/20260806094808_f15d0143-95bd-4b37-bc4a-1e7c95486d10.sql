CREATE OR REPLACE FUNCTION public.is_content_editor()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    current_user IN ('service_role', 'postgres', 'supabase_admin', 'supabase_read_only_user') OR
    current_setting('role', true) IN ('service_role', 'postgres', 'supabase_admin') OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role::text IN ('admin', 'moderator')
    )
  );
END;
$$;
