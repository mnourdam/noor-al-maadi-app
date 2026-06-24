
-- ============ profiles additions ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'ar',
  ADD COLUMN IF NOT EXISTS hearts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS longest_streak integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS museum_items_unlocked integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS investigations_completed integer NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_account_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_status_check
  CHECK (account_status IN ('active','suspended','disabled'));

CREATE INDEX IF NOT EXISTS profiles_last_active_idx ON public.profiles (last_active DESC);
CREATE INDEX IF NOT EXISTS profiles_join_date_idx  ON public.profiles (join_date DESC);
CREATE INDEX IF NOT EXISTS profiles_account_status_idx ON public.profiles (account_status);

-- ============ admin_audit_log ============
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email     text,
  action          text NOT NULL,
  target_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  detail          jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx  ON public.admin_audit_log (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx   ON public.admin_audit_log (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_action_idx  ON public.admin_audit_log (action, created_at DESC);

GRANT SELECT ON public.admin_audit_log TO authenticated;
GRANT ALL    ON public.admin_audit_log TO service_role;

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin read audit log"  ON public.admin_audit_log;
CREATE POLICY "admin read audit log"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (public.is_content_admin());

-- No INSERT/UPDATE/DELETE policies: all writes must go through SECURITY DEFINER RPCs.

-- ============ helper: log an admin action ============
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action text,
  p_target uuid,
  p_detail jsonb,
  p_reason text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
  log_id uuid;
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT email INTO uemail FROM auth.users WHERE id = uid;
  INSERT INTO public.admin_audit_log(actor_id, actor_email, action, target_user_id, detail, reason)
  VALUES (uid, uemail, p_action, p_target, COALESCE(p_detail, '{}'::jsonb), NULLIF(trim(p_reason),''))
  RETURNING id INTO log_id;
  RETURN log_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(text,uuid,jsonb,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_admin_action(text,uuid,jsonb,text) TO authenticated;

-- ============ touch_my_last_active ============
CREATE OR REPLACE FUNCTION public.touch_my_last_active()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN; END IF;
  UPDATE public.profiles SET last_active = now() WHERE id = uid;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.touch_my_last_active() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.touch_my_last_active() TO authenticated;

-- ============ admin_list_users ============
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT NULL,
  p_filter text DEFAULT NULL,         -- active|suspended|disabled|guest|registered|admin|has_referrals|no_referrals
  p_min_level int DEFAULT NULL,
  p_max_level int DEFAULT NULL,
  p_joined_after timestamptz DEFAULT NULL,
  p_joined_before timestamptz DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  total_count int;
  rows jsonb;
  s text := lower(coalesce(p_search,''));
BEGIN
  IF NOT public.is_content_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH base AS (
    SELECT
      p.id,
      p.username,
      p.display_name,
      p.email,
      p.avatar_id,
      p.join_date,
      p.last_active,
      p.level,
      p.xp,
      p.dinars,
      p.hearts,
      p.streak,
      p.longest_streak,
      p.campaigns_completed,
      p.museum_items_unlocked,
      p.investigations_completed,
      p.referral_code,
      p.referred_by,
      p.account_status,
      p.marketing_opt_in,
      CASE
        WHEN lower(coalesce(p.email,'')) = 'mnourdam@gmail.com' THEN 'admin'
        WHEN p.email IS NULL OR p.email = '' THEN 'guest'
        ELSE 'registered'
      END AS account_type,
      (SELECT count(*) FROM public.referrals r WHERE r.referrer_id = p.id) AS referrals_count
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
      WHEN 'has_referrals' THEN referrals_count > 0
      WHEN 'no_referrals'  THEN referrals_count = 0
      ELSE true
    END
  )
  SELECT count(*)::int INTO total_count FROM filtered;

  SELECT coalesce(jsonb_agg(to_jsonb(f.*) ORDER BY f.join_date DESC), '[]'::jsonb)
    INTO rows
  FROM (
    SELECT * FROM filtered
    ORDER BY join_date DESC
    LIMIT greatest(0, least(p_limit, 500))
    OFFSET greatest(0, p_offset)
  ) f;

  RETURN jsonb_build_object('rows', rows, 'total', total_count);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_users(text,text,int,int,timestamptz,timestamptz,int,int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_users(text,text,int,int,timestamptz,timestamptz,int,int) TO authenticated;

-- ============ admin_user_detail ============
CREATE OR REPLACE FUNCTION public.admin_user_detail(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_content_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
    'profile', to_jsonb(p.*),
    'auth_email', (SELECT email FROM auth.users WHERE id = p.id),
    'auth_created_at', (SELECT created_at FROM auth.users WHERE id = p.id),
    'auth_last_sign_in_at', (SELECT last_sign_in_at FROM auth.users WHERE id = p.id),
    'referrer', (
      SELECT to_jsonb(pp.*) FROM public.profiles pp WHERE pp.id = p.referred_by
    ),
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
        FROM public.notifications
        WHERE target_user_id = p.id
        ORDER BY created_at DESC LIMIT 25
      ) n
    ),
    'audit_log', (
      SELECT coalesce(jsonb_agg(to_jsonb(a.*) ORDER BY a.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, action, actor_email, detail, reason, created_at
        FROM public.admin_audit_log
        WHERE target_user_id = p.id
        ORDER BY created_at DESC LIMIT 50
      ) a
    ),
    'devices_count', (
      SELECT count(*) FROM public.device_tokens WHERE user_id = p.id
    )
  )
  INTO result
  FROM public.profiles p
  WHERE p.id = p_user_id;

  IF result IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  RETURN result;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_user_detail(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_user_detail(uuid) TO authenticated;

-- ============ admin_adjust_balance ============
CREATE OR REPLACE FUNCTION public.admin_adjust_balance(
  p_user_id uuid,
  p_field text,         -- 'xp' | 'dinars'  (NOT hearts — hearts are local-only for now)
  p_delta int,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_value int;
  old_value int;
BEGIN
  IF NOT public.is_content_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
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
$$;
REVOKE EXECUTE ON FUNCTION public.admin_adjust_balance(uuid,text,int,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_adjust_balance(uuid,text,int,text) TO authenticated;

-- ============ admin_set_account_status ============
CREATE OR REPLACE FUNCTION public.admin_set_account_status(
  p_user_id uuid,
  p_status text,        -- active|suspended|disabled
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_status text;
BEGIN
  IF NOT public.is_content_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
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
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_account_status(uuid,text,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_set_account_status(uuid,text,text) TO authenticated;
