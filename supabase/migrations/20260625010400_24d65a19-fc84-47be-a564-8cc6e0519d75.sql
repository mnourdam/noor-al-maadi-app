
-- 1. Roles enum
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner','admin','editor','player');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Role check helpers (SECURITY DEFINER, search_path locked)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

-- Manager = owner OR admin (full control: users, balances, role grants)
CREATE OR REPLACE FUNCTION public.is_user_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT
    -- bootstrap email keeps the original owner unlocked even if no role row exists yet
    lower(coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), '')) = 'mnourdam@gmail.com'
    OR public.has_role(auth.uid(), 'owner')
    OR public.has_role(auth.uid(), 'admin');
$$;

-- Content editor = manager OR editor (can edit encyclopedia/atlas/import/campaigns)
CREATE OR REPLACE FUNCTION public.is_content_editor()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_user_manager() OR public.has_role(auth.uid(), 'editor');
$$;

-- Existing content gate redefined to mean "editor or above" so all existing
-- content tables and RPCs keep working without per-call refactors.
CREATE OR REPLACE FUNCTION public.is_content_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_content_editor();
$$;

-- 4. user_roles RLS
DROP POLICY IF EXISTS "users see own roles" ON public.user_roles;
CREATE POLICY "users see own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_user_manager());

DROP POLICY IF EXISTS "managers manage roles" ON public.user_roles;
CREATE POLICY "managers manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_user_manager())
  WITH CHECK (public.is_user_manager());

-- 5. Tighten user-management RPCs to managers only
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(p_user_id uuid, p_field text, p_delta integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  new_value int;
  old_value int;
BEGIN
  IF NOT public.is_user_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user'; END IF;
  IF p_field NOT IN ('xp','dinars') THEN RAISE EXCEPTION 'unsupported_field'; END IF;
  IF p_delta IS NULL OR p_delta = 0 THEN RAISE EXCEPTION 'invalid_delta'; END IF;
  IF abs(p_delta) > 10000000 THEN RAISE EXCEPTION 'delta_out_of_range'; END IF;

  IF p_field = 'xp' THEN
    SELECT xp INTO old_value FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    new_value := GREATEST(0, LEAST(100000000, COALESCE(old_value,0) + p_delta));
    UPDATE public.profiles SET xp = new_value, updated_at = now() WHERE id = p_user_id;
  ELSE
    SELECT dinars INTO old_value FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    new_value := GREATEST(0, LEAST(100000000, COALESCE(old_value,0) + p_delta));
    UPDATE public.profiles SET dinars = new_value, updated_at = now() WHERE id = p_user_id;
  END IF;

  PERFORM public.log_admin_action(
    'balance.adjust', p_user_id,
    jsonb_build_object('field', p_field, 'delta', p_delta, 'old', old_value, 'new', new_value),
    p_reason
  );
  RETURN jsonb_build_object('ok', true, 'field', p_field, 'old', old_value, 'new', new_value);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_account_status(p_user_id uuid, p_status text, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE old_status text;
BEGIN
  IF NOT public.is_user_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_status NOT IN ('active','suspended','disabled') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  SELECT account_status INTO old_status FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF old_status IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  UPDATE public.profiles SET account_status = p_status, updated_at = now() WHERE id = p_user_id;
  PERFORM public.log_admin_action(
    'status.set', p_user_id,
    jsonb_build_object('old', old_status, 'new', p_status), p_reason
  );
  RETURN jsonb_build_object('ok', true, 'old', old_status, 'new', p_status);
END;
$function$;

-- admin_list_users and admin_user_detail are user-management surfaces.
-- Rebuild guard to is_user_manager(); body unchanged otherwise.
CREATE OR REPLACE FUNCTION public.admin_list_users(p_search text DEFAULT NULL, p_filter text DEFAULT NULL, p_min_level integer DEFAULT NULL, p_max_level integer DEFAULT NULL, p_joined_after timestamptz DEFAULT NULL, p_joined_before timestamptz DEFAULT NULL, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $function$
DECLARE
  result jsonb;
  s text := lower(coalesce(p_search,''));
BEGIN
  IF NOT public.is_user_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH base AS (
    SELECT
      p.id, p.username, p.display_name, p.email, p.avatar_id,
      p.join_date, p.last_active,
      p.level, p.xp, p.dinars, p.hearts, p.streak, p.longest_streak,
      p.campaigns_completed, p.museum_items_unlocked, p.investigations_completed,
      p.referral_code, p.referred_by,
      p.account_status, p.marketing_opt_in, p.locale,
      CASE
        WHEN public.has_role(p.id, 'owner') OR public.has_role(p.id, 'admin')
          OR lower(coalesce(p.email,'')) = 'mnourdam@gmail.com' THEN 'admin'
        WHEN public.has_role(p.id, 'editor') THEN 'editor'
        WHEN p.email IS NULL OR p.email = '' THEN 'guest'
        ELSE 'registered'
      END AS account_type,
      (SELECT count(*) FROM public.referrals r WHERE r.referrer_id = p.id) AS referrals_count,
      (SELECT coalesce(array_agg(role::text ORDER BY role), ARRAY[]::text[]) FROM public.user_roles ur WHERE ur.user_id = p.id) AS roles
    FROM public.profiles p
    WHERE (s = '' OR
           lower(coalesce(p.username,''))     LIKE '%'||s||'%' OR
           lower(coalesce(p.display_name,'')) LIKE '%'||s||'%' OR
           lower(coalesce(p.email,''))        LIKE '%'||s||'%')
      AND (p_min_level IS NULL OR p.level >= p_min_level)
      AND (p_max_level IS NULL OR p.level <= p_max_level)
      AND (p_joined_after  IS NULL OR p.join_date >= p_joined_after)
      AND (p_joined_before IS NULL OR p.join_date <= p_joined_before)
  ),
  filtered AS (
    SELECT * FROM base
    WHERE CASE coalesce(p_filter,'')
      WHEN ''              THEN true
      WHEN 'active'        THEN account_status = 'active'
      WHEN 'suspended'     THEN account_status = 'suspended'
      WHEN 'disabled'      THEN account_status = 'disabled'
      WHEN 'guest'         THEN account_type = 'guest'
      WHEN 'registered'    THEN account_type = 'registered'
      WHEN 'admin'         THEN account_type = 'admin'
      WHEN 'editor'        THEN account_type = 'editor'
      WHEN 'has_referrals' THEN referrals_count > 0
      WHEN 'no_referrals'  THEN referrals_count = 0
      ELSE true
    END
  ),
  total AS ( SELECT count(*)::int AS n FROM filtered ),
  page AS (
    SELECT * FROM filtered
    ORDER BY join_date DESC
    LIMIT greatest(0, least(p_limit, 500))
    OFFSET greatest(0, p_offset)
  )
  SELECT jsonb_build_object(
    'rows',  coalesce((SELECT jsonb_agg(to_jsonb(page.*) ORDER BY page.join_date DESC) FROM page), '[]'::jsonb),
    'total', (SELECT n FROM total)
  )
  INTO result;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_user_detail(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth
AS $function$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_user_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'profile', to_jsonb(p.*),
    'auth_email', (SELECT email FROM auth.users WHERE id = p.id),
    'auth_created_at', (SELECT created_at FROM auth.users WHERE id = p.id),
    'auth_last_sign_in_at', (SELECT last_sign_in_at FROM auth.users WHERE id = p.id),
    'roles', (SELECT coalesce(array_agg(role::text ORDER BY role), ARRAY[]::text[]) FROM public.user_roles ur WHERE ur.user_id = p.id),
    'referrer', (SELECT to_jsonb(pp.*) FROM public.profiles pp WHERE pp.id = p.referred_by),
    'referrals_out', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'referred_id', r.referred_id, 'stage', r.stage,
        'stage1_at', r.stage1_at, 'stage2_at', r.stage2_at,
        'username', pp.username, 'display_name', pp.display_name, 'level', pp.level,
        'created_at', r.created_at
      ) ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM public.referrals r
      LEFT JOIN public.profiles pp ON pp.id = r.referred_id
      WHERE r.referrer_id = p.id
    ),
    'recent_notifications', (
      SELECT coalesce(jsonb_agg(to_jsonb(n.*) ORDER BY n.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, title, body, type, status, created_at, sent_at, deep_link
        FROM public.notifications WHERE target_user_id = p.id
        ORDER BY created_at DESC LIMIT 25
      ) n
    ),
    'audit_log', (
      SELECT coalesce(jsonb_agg(to_jsonb(a.*) ORDER BY a.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, action, actor_email, detail, reason, created_at
        FROM public.admin_audit_log WHERE target_user_id = p.id
        ORDER BY created_at DESC LIMIT 50
      ) a
    ),
    'devices_count', (SELECT count(*) FROM public.device_tokens WHERE user_id = p.id)
  )
  INTO result FROM public.profiles p WHERE p.id = p_user_id;
  IF result IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN result;
END;
$function$;

-- 6. log_admin_action: any editor+ may log
CREATE OR REPLACE FUNCTION public.log_admin_action(p_action text, p_target uuid, p_detail jsonb, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $function$
DECLARE uid uuid := auth.uid(); uemail text; log_id uuid;
BEGIN
  IF NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT email INTO uemail FROM auth.users WHERE id = uid;
  INSERT INTO public.admin_audit_log(actor_id, actor_email, action, target_user_id, detail, reason)
  VALUES (uid, uemail, p_action, p_target, COALESCE(p_detail, '{}'::jsonb), NULLIF(trim(p_reason),''))
  RETURNING id INTO log_id;
  RETURN log_id;
END;
$function$;

-- 7. Manager-only role assignment with audit logging.
CREATE OR REPLACE FUNCTION public.admin_assign_role(p_user_id uuid, p_role public.app_role, p_reason text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  existing public.app_role[];
BEGIN
  IF NOT public.is_user_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'missing_user'; END IF;
  -- Only owner can grant owner.
  IF p_role = 'owner' AND NOT public.has_role(uid, 'owner')
     AND lower(coalesce((SELECT email FROM auth.users WHERE id = uid), '')) <> 'mnourdam@gmail.com'
  THEN
    RAISE EXCEPTION 'forbidden_owner_grant';
  END IF;
  -- 'player' is implicit — clear all explicit roles.
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
  SELECT array_agg(role::text ORDER BY role) INTO existing
    FROM public.user_roles WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true, 'roles', coalesce(existing, ARRAY[]::text[]));
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_revoke_role(p_user_id uuid, p_role public.app_role, p_reason text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NOT public.is_user_manager() THEN RAISE EXCEPTION 'forbidden'; END IF;
  -- Only owner can revoke owner.
  IF p_role = 'owner' AND NOT public.has_role(uid, 'owner')
     AND lower(coalesce((SELECT email FROM auth.users WHERE id = uid), '')) <> 'mnourdam@gmail.com'
  THEN
    RAISE EXCEPTION 'forbidden_owner_revoke';
  END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user_id AND role = p_role;
  PERFORM public.log_admin_action(
    'role.revoke', p_user_id,
    jsonb_build_object('role', p_role::text), p_reason
  );
  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- "Am I a manager?" / "Am I an editor?" — small helpers the client can poll
CREATE OR REPLACE FUNCTION public.current_user_capabilities()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'is_manager', public.is_user_manager(),
    'is_editor',  public.is_content_editor(),
    'roles', (
      SELECT coalesce(array_agg(role::text ORDER BY role), ARRAY[]::text[])
      FROM public.user_roles WHERE user_id = auth.uid()
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_content_editor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_role(uuid, public.app_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_role(uuid, public.app_role, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_capabilities() TO authenticated;

-- 8. Seed owner role for existing bootstrap admin.
INSERT INTO public.user_roles (user_id, role, granted_by)
SELECT u.id, 'owner', u.id FROM auth.users u
WHERE lower(u.email) = 'mnourdam@gmail.com'
ON CONFLICT DO NOTHING;
