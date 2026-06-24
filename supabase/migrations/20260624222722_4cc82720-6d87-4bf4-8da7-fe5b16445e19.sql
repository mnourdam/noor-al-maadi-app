
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT NULL,
  p_filter text DEFAULT NULL,
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
      p.id, p.username, p.display_name, p.email, p.avatar_id,
      p.join_date, p.last_active,
      p.level, p.xp, p.dinars, p.hearts, p.streak, p.longest_streak,
      p.campaigns_completed, p.museum_items_unlocked, p.investigations_completed,
      p.referral_code, p.referred_by,
      p.account_status, p.marketing_opt_in, p.locale,
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
