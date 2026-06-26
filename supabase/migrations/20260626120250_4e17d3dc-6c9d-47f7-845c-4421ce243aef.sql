CREATE OR REPLACE FUNCTION public.is_content_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_user_manager();
$$;