ALTER TABLE public.user_achievements
  ADD COLUMN IF NOT EXISTS presented_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS notified_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS presentation_origin text,
  ADD COLUMN IF NOT EXISTS repair_origin text,
  ADD COLUMN IF NOT EXISTS repair_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS user_achievements_presentation_idx
  ON public.user_achievements (user_id, presented_at, notified_at);

CREATE OR REPLACE FUNCTION public.mark_achievement_notified(
  _id text,
  _origin text DEFAULT 'live_gameplay_unlock'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_touched boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _id IS NULL OR length(trim(_id)) = 0 THEN
    RETURN false;
  END IF;

  UPDATE public.user_achievements
     SET notified_at = COALESCE(notified_at, now()),
         presentation_origin = COALESCE(presentation_origin, _origin)
   WHERE user_id = v_user
     AND achievement_id = _id
     AND notified_at IS NULL
  RETURNING true INTO v_touched;

  RETURN COALESCE(v_touched, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_achievement_presented(
  _ids text[],
  _origin text DEFAULT 'live_gameplay_unlock'
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_updated text[] := ARRAY[]::text[];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  WITH upd AS (
    UPDATE public.user_achievements
       SET presented_at = COALESCE(presented_at, now()),
           notified_at = COALESCE(notified_at, now()),
           presentation_origin = COALESCE(presentation_origin, _origin)
     WHERE user_id = v_user
       AND achievement_id = ANY(_ids)
       AND (presented_at IS NULL OR notified_at IS NULL)
    RETURNING achievement_id
  )
  SELECT COALESCE(array_agg(achievement_id), ARRAY[]::text[])
    INTO v_updated
    FROM upd;

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.repair_historical_achievements(
  _ids text[],
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  repaired text[],
  existing text[],
  rejected text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_valid text[] := ARRAY[]::text[];
  v_existing text[] := ARRAY[]::text[];
  v_repaired text[] := ARRAY[]::text[];
  v_rejected text[] := ARRAY[]::text[];
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN QUERY SELECT ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[];
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT r.id), ARRAY[]::text[])
    INTO v_valid
    FROM public.achievement_registry r
   WHERE r.id = ANY(_ids);

  v_rejected := ARRAY(
    SELECT unnest(_ids)
    EXCEPT
    SELECT unnest(v_valid)
  );

  SELECT COALESCE(array_agg(ua.achievement_id), ARRAY[]::text[])
    INTO v_existing
    FROM public.user_achievements ua
   WHERE ua.user_id = v_user
     AND ua.achievement_id = ANY(v_valid);

  WITH ins AS (
    INSERT INTO public.user_achievements (
      user_id,
      achievement_id,
      unlocked_at,
      rewards_granted_at,
      rewards_payload,
      engine_version,
      definition_version,
      presented_at,
      notified_at,
      presentation_origin,
      repair_origin,
      repair_metadata
    )
    SELECT
      v_user,
      r.id,
      now(),
      now(),
      jsonb_build_object(
        'historical_repair', true,
        'reward_grant_suppressed', true,
        'reason', 'legacy_reward_truth_unproven',
        'xp', 0,
        'dinars', 0,
        'title_id', null
      ),
      r.engine_version,
      1,
      now(),
      now(),
      'historical_repair',
      'historical_repair',
      COALESCE(_metadata, '{}'::jsonb)
    FROM public.achievement_registry r
    WHERE r.id = ANY(v_valid)
    ON CONFLICT (user_id, achievement_id) DO NOTHING
    RETURNING achievement_id
  )
  SELECT COALESCE(array_agg(achievement_id), ARRAY[]::text[])
    INTO v_repaired
    FROM ins;

  UPDATE public.user_achievements ua
     SET presented_at = COALESCE(ua.presented_at, now()),
         notified_at = COALESCE(ua.notified_at, now()),
         presentation_origin = COALESCE(ua.presentation_origin, 'historical_repair'),
         repair_origin = COALESCE(ua.repair_origin, 'historical_repair'),
         repair_metadata = CASE
           WHEN ua.repair_metadata = '{}'::jsonb THEN COALESCE(_metadata, '{}'::jsonb)
           ELSE ua.repair_metadata
         END
   WHERE ua.user_id = v_user
     AND ua.achievement_id = ANY(v_valid)
     AND (ua.presented_at IS NULL OR ua.notified_at IS NULL);

  RETURN QUERY SELECT
    COALESCE(v_repaired, ARRAY[]::text[]),
    COALESCE(v_existing, ARRAY[]::text[]),
    COALESCE(v_rejected, ARRAY[]::text[]);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_achievement_notified(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_achievement_presented(text[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.repair_historical_achievements(text[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_achievement_notified(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_achievement_presented(text[], text) TO service_role;
GRANT EXECUTE ON FUNCTION public.repair_historical_achievements(text[], jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.mark_achievement_notified(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_achievement_presented(text[], text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.repair_historical_achievements(text[], jsonb) FROM anon, public;