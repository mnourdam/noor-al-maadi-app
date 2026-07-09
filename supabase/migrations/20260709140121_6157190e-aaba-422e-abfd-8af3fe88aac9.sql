
CREATE OR REPLACE FUNCTION public.admin_list_users(p_search text DEFAULT NULL::text, p_filter text DEFAULT NULL::text, p_min_level integer DEFAULT NULL::integer, p_max_level integer DEFAULT NULL::integer, p_joined_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_joined_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
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
      (SELECT coalesce(array_agg(role::text ORDER BY role), ARRAY[]::text[]) FROM public.user_roles ur WHERE ur.user_id = p.id) AS roles,
      (SELECT coalesce(array_agg(DISTINCT i.provider ORDER BY i.provider), ARRAY[]::text[])
         FROM auth.identities i WHERE i.user_id = p.id) AS providers
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
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
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
    'providers', (
      SELECT coalesce(array_agg(DISTINCT i.provider ORDER BY i.provider), ARRAY[]::text[])
      FROM auth.identities i WHERE i.user_id = p.id
    ),
    'identities', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'provider', i.provider,
        'provider_id', i.provider_id,
        'email', i.identity_data->>'email',
        'name', COALESCE(i.identity_data->>'full_name', i.identity_data->>'name'),
        'avatar_url', COALESCE(i.identity_data->>'avatar_url', i.identity_data->>'picture'),
        'last_sign_in_at', i.last_sign_in_at,
        'created_at', i.created_at,
        'updated_at', i.updated_at
      ) ORDER BY i.created_at ASC), '[]'::jsonb)
      FROM auth.identities i WHERE i.user_id = p.id
    ),
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
