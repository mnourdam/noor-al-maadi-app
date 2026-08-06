CREATE OR REPLACE FUNCTION public.is_content_editor()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role (used by Lovable tools) and users with editor/admin roles
  RETURN (
    current_setting('role') = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role IN ('admin', 'moderator')
    )
  );
END;
$$;
