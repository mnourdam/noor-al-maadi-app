CREATE OR REPLACE FUNCTION public.is_content_editor()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    current_setting('role') = 'service_role' OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
      AND role::text IN ('admin', 'moderator')
    )
  );
END;
$$;
