-- 1. Collapse duplicate notification deliveries into one row per (notification, user).
WITH ranked AS (
  SELECT id, notification_id, user_id,
         first_value(id) OVER (PARTITION BY notification_id, user_id ORDER BY created_at NULLS LAST, id) AS keep_id
    FROM public.notification_deliveries
), merged AS (
  SELECT d.notification_id, d.user_id,
         min(d.read_at) AS read_at, min(d.opened_at) AS opened_at,
         min(d.dismissed_at) AS dismissed_at,
         CASE WHEN bool_and(d.deleted_at IS NOT NULL) THEN max(d.deleted_at) ELSE NULL END AS deleted_at,
         max(d.sent_at) AS sent_at, max(d.delivered_at) AS delivered_at
    FROM public.notification_deliveries d
   GROUP BY d.notification_id, d.user_id
)
UPDATE public.notification_deliveries t
   SET read_at = m.read_at, opened_at = m.opened_at, dismissed_at = m.dismissed_at,
       deleted_at = m.deleted_at, sent_at = m.sent_at, delivered_at = m.delivered_at
  FROM merged m
 WHERE t.notification_id = m.notification_id AND t.user_id = m.user_id;

DELETE FROM public.notification_deliveries d
 USING (
   SELECT id, first_value(id) OVER (PARTITION BY notification_id, user_id ORDER BY created_at NULLS LAST, id) AS keep_id
     FROM public.notification_deliveries
 ) r
 WHERE d.id = r.id AND r.id <> r.keep_id;

CREATE UNIQUE INDEX IF NOT EXISTS notification_deliveries_notif_user_uidx
  ON public.notification_deliveries (notification_id, user_id);

-- 2. Defensive de-duplication inside the Notification Center reader.
CREATE OR REPLACE FUNCTION public.list_my_notifications(p_limit integer DEFAULT 100, p_before timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  uid uuid := auth.uid();
  baseline timestamptz;
  result jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT notification_started_at INTO baseline FROM public.profiles WHERE id = uid;
  baseline := COALESCE(baseline, 'epoch'::timestamptz);
  WITH deliveries AS (
    SELECT DISTINCT ON (d.notification_id)
           d.notification_id, d.id, d.read_at, d.opened_at, d.dismissed_at, d.deleted_at
      FROM public.notification_deliveries d
     WHERE d.user_id = uid
     ORDER BY d.notification_id, d.created_at NULLS LAST, d.id
  ), rows AS (
    SELECT
      n.id, n.title, n.body, n.type, n.category, n.icon, n.image_url,
      n.deep_link, n.payload, n.priority, n.sender,
      n.created_at, n.sent_at,
      d.id AS delivery_id, d.read_at, d.opened_at, d.dismissed_at
    FROM public.notifications n
    LEFT JOIN deliveries d ON d.notification_id = n.id
    WHERE n.status = 'sent'
      AND n.created_at >= baseline
      AND (
        (n.target_type = 'user' AND n.target_user_id = uid)
        OR (n.target_type IN ('broadcast','all'))
      )
      AND (d.deleted_at IS NULL)
      AND (p_before IS NULL OR n.created_at < p_before)
    ORDER BY n.created_at DESC
    LIMIT LEAST(GREATEST(p_limit, 1), 200)
  )
  SELECT coalesce(jsonb_agg(to_jsonb(rows.*) ORDER BY rows.created_at DESC), '[]'::jsonb) INTO result FROM rows;
  RETURN result;
END
$fn$;

-- 3. Widen the curated public profile payload (still no email / hearts /
--    dinars / referral_code / marketing_opt_in / locale / account_status).
DROP FUNCTION IF EXISTS public.list_public_profiles(uuid[], text, text, uuid, integer);
CREATE FUNCTION public.list_public_profiles(
  p_ids uuid[] DEFAULT NULL,
  p_username text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_exclude_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid, username text, display_name text, avatar_id text, level integer, xp integer,
  title text, bio text, favorite_state_id text, favorite_figure_id text,
  campaigns_completed integer, artifacts_collected integer, discovery_pct integer,
  streak integer, longest_streak integer, museum_items_unlocked integer,
  investigations_completed integer, join_date timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT p.id, p.username, p.display_name, p.avatar_id, p.level, p.xp,
         p.title, p.bio, p.favorite_state_id, p.favorite_figure_id,
         p.campaigns_completed, p.artifacts_collected, p.discovery_pct,
         p.streak, p.longest_streak, p.museum_items_unlocked,
         p.investigations_completed, p.join_date
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND COALESCE(p.account_status, 'active') = 'active'
    AND (p_ids IS NULL OR p.id = ANY (p_ids))
    AND (p_username IS NULL OR p.username ILIKE p_username)
    AND (p_search IS NULL OR p.username ILIKE p_search OR p.display_name ILIKE p_search)
    AND (p_exclude_id IS NULL OR p.id <> p_exclude_id)
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
$fn$;

REVOKE ALL ON FUNCTION public.list_public_profiles(uuid[], text, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_public_profiles(uuid[], text, text, uuid, integer) TO authenticated, service_role;

-- 4. Repair the profile-open RPCs (they referenced the dropped
--    public.public_profiles view, so every call raised and the UI fell back
--    to an empty state). Public profiles are visible to any signed-in
--    player; private columns are never selected.
CREATE OR REPLACE FUNCTION public.get_gated_public_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT to_jsonb(pp) INTO result
    FROM public.list_public_profiles(ARRAY[p_user_id]::uuid[], NULL, NULL, NULL, 1) pp;
  RETURN result;
END
$fn$;

CREATE OR REPLACE FUNCTION public.get_gated_public_profile_by_username(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT to_jsonb(pp) INTO result
    FROM public.list_public_profiles(NULL, p_username, NULL, NULL, 1) pp;
  RETURN result;
END
$fn$;

-- 5. Restore table-level SELECT for authenticated so Realtime's own-row RLS
--    check passes again. Row access stays owner-only via the existing
--    "auth.uid() = id" SELECT policy; no other user's row is readable.
GRANT SELECT ON public.profiles TO authenticated;