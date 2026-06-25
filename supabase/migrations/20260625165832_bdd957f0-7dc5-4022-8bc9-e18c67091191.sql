CREATE OR REPLACE FUNCTION public.admin_assign_role(p_user_id uuid, p_role app_role, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  existing text[];
BEGIN
  IF NOT public.is_user_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user'; END IF;
  IF p_role = 'owner' AND NOT public.has_role(uid, 'owner')
     AND lower(coalesce((SELECT email FROM auth.users WHERE id = uid), '')) <> 'mnourdam@gmail.com'
  THEN
    RAISE EXCEPTION 'forbidden_owner_grant';
  END IF;
  IF p_role = 'player' THEN
    DELETE FROM public.user_roles WHERE user_id = p_user_id;
  ELSE
    INSERT INTO public.user_roles (user_id, role, granted_by)
    VALUES (p_user_id, p_role, uid)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  PERFORM public.log_admin_action(
    'role.assign', p_user_id,
    jsonb_build_object('role', p_role::text), p_reason
  );
  SELECT COALESCE(array_agg(role::text ORDER BY role::text), ARRAY[]::text[]) INTO existing
    FROM public.user_roles WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true, 'roles', to_jsonb(existing));
END;
$function$;