
-- =============================================================
-- Priority Zero — Server-authoritative player progress
-- -------------------------------------------------------------
-- 1) Legacy backfill of user_campaign_completions from
--    user_campaign_progress evidence (strong evidence only:
--    every published chapter of the campaign has a row with
--    completed_at IS NOT NULL for this user).
-- 2) user_onboarding_state table + RPCs (tutorial server mirror).
-- 3) record_campaign_progress_v2 RPC — atomic chapter upsert
--    that also stamps user_campaign_completions when every
--    published chapter is complete.
-- =============================================================

-- ---------- 1) BACKFILL (idempotent) --------------------------
WITH published AS (
  SELECT id AS campaign_id,
         COALESCE(content_version, 1) AS campaign_version,
         jsonb_array_elements(COALESCE(data->'chapters', '[]'::jsonb))->>'id' AS chapter_id
  FROM public.admin_campaigns
  WHERE status = 'published'
    AND jsonb_array_length(COALESCE(data->'chapters', '[]'::jsonb)) > 0
),
required AS (
  SELECT campaign_id, campaign_version, array_agg(chapter_id) AS req_ids, count(*) AS req_count
  FROM published
  WHERE chapter_id IS NOT NULL
  GROUP BY campaign_id, campaign_version
),
completed AS (
  SELECT ucp.user_id,
         ucp.campaign_id,
         array_agg(ucp.chapter_id) FILTER (WHERE ucp.completed_at IS NOT NULL) AS done_ids,
         min(ucp.completed_at) FILTER (WHERE ucp.completed_at IS NOT NULL) AS earliest
  FROM public.user_campaign_progress ucp
  GROUP BY ucp.user_id, ucp.campaign_id
),
eligible AS (
  SELECT c.user_id, c.campaign_id, r.campaign_version, c.earliest
  FROM completed c
  JOIN required r ON r.campaign_id = c.campaign_id
  WHERE c.done_ids IS NOT NULL
    AND (
      SELECT bool_and(rid = ANY (c.done_ids))
      FROM unnest(r.req_ids) AS rid
    )
)
INSERT INTO public.user_campaign_completions
  (user_id, campaign_id, campaign_version, source, completed_at)
SELECT user_id, campaign_id, campaign_version, 'legacy_backfill', COALESCE(earliest, now())
FROM eligible
ON CONFLICT (user_id, campaign_id) DO NOTHING;

-- ---------- 2) TUTORIAL / ONBOARDING SERVER STATE -------------
CREATE TABLE IF NOT EXISTS public.user_onboarding_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tutorial_id TEXT NOT NULL,
  completed_version INTEGER NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tutorial_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_onboarding_state TO authenticated;
GRANT ALL ON public.user_onboarding_state TO service_role;

ALTER TABLE public.user_onboarding_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "onboarding_select_own" ON public.user_onboarding_state;
CREATE POLICY "onboarding_select_own" ON public.user_onboarding_state
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "onboarding_insert_own" ON public.user_onboarding_state;
CREATE POLICY "onboarding_insert_own" ON public.user_onboarding_state
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "onboarding_update_own" ON public.user_onboarding_state;
CREATE POLICY "onboarding_update_own" ON public.user_onboarding_state
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_onboarding_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_onboarding_updated_at ON public.user_onboarding_state;
CREATE TRIGGER trg_onboarding_updated_at BEFORE UPDATE ON public.user_onboarding_state
  FOR EACH ROW EXECUTE FUNCTION public.update_onboarding_updated_at();

CREATE OR REPLACE FUNCTION public.record_tutorial_completion(
  p_tutorial_id TEXT,
  p_version INTEGER
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_final INTEGER;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  IF p_tutorial_id IS NULL OR length(trim(p_tutorial_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_tutorial_id');
  END IF;
  IF p_version IS NULL OR p_version < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_version');
  END IF;

  INSERT INTO public.user_onboarding_state (user_id, tutorial_id, completed_version, completed_at)
  VALUES (v_uid, p_tutorial_id, p_version, now())
  ON CONFLICT (user_id, tutorial_id) DO UPDATE
    SET completed_version = GREATEST(user_onboarding_state.completed_version, EXCLUDED.completed_version),
        completed_at = LEAST(user_onboarding_state.completed_at, EXCLUDED.completed_at),
        updated_at = now()
  RETURNING completed_version INTO v_final;

  RETURN jsonb_build_object('ok', true, 'tutorial_id', p_tutorial_id, 'completed_version', v_final);
END; $$;

GRANT EXECUTE ON FUNCTION public.record_tutorial_completion(TEXT, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_tutorial_completion(p_tutorial_id TEXT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_version INTEGER;
  v_at TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  SELECT completed_version, completed_at INTO v_version, v_at
  FROM public.user_onboarding_state
  WHERE user_id = v_uid AND tutorial_id = p_tutorial_id;
  IF v_version IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'completed', false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'completed', true,
    'completed_version', v_version,
    'completed_at', v_at);
END; $$;

GRANT EXECUTE ON FUNCTION public.get_tutorial_completion(TEXT) TO authenticated;

-- ---------- 3) record_campaign_progress_v2 --------------------
-- Atomic chapter upsert + sticky completion when every published
-- chapter is complete. Server is the sole authority for the
-- "campaign complete" decision — client cannot force it.
CREATE OR REPLACE FUNCTION public.record_campaign_progress_v2(
  p_campaign_id TEXT,
  p_chapter_id TEXT,
  p_completed BOOLEAN DEFAULT true,
  p_score INTEGER DEFAULT NULL,
  p_xp_earned INTEGER DEFAULT NULL,
  p_coins_earned INTEGER DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_camp jsonb;
  v_required_ids TEXT[];
  v_done_ids TEXT[];
  v_all_done BOOLEAN := false;
  v_campaign_version INTEGER;
  v_first_time_completion BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  IF p_campaign_id IS NULL OR length(trim(p_campaign_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_campaign_id');
  END IF;
  IF p_chapter_id IS NULL OR length(trim(p_chapter_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_chapter_id');
  END IF;

  -- Validate campaign exists and get chapters (published or draft — server tolerates admin-preview flows)
  SELECT data, COALESCE(content_version, 1) INTO v_camp, v_campaign_version
  FROM public.admin_campaigns WHERE id = p_campaign_id;

  IF v_camp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_not_found');
  END IF;

  SELECT array_agg(elem->>'id') INTO v_required_ids
  FROM jsonb_array_elements(COALESCE(v_camp->'chapters', '[]'::jsonb)) elem
  WHERE elem->>'id' IS NOT NULL;

  -- Chapter must belong to campaign
  IF v_required_ids IS NULL OR NOT (p_chapter_id = ANY (v_required_ids)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'chapter_not_in_campaign');
  END IF;

  -- Upsert chapter progress (never downgrade completion — sticky)
  INSERT INTO public.user_campaign_progress
    (user_id, campaign_id, chapter_id, status, score, xp_earned, coins_earned, completed_at)
  VALUES
    (v_uid, p_campaign_id, p_chapter_id,
     CASE WHEN p_completed THEN 'completed' ELSE 'unlocked' END,
     COALESCE(p_score, 0),
     COALESCE(p_xp_earned, 0),
     COALESCE(p_coins_earned, 0),
     CASE WHEN p_completed THEN now() ELSE NULL END)
  ON CONFLICT (user_id, campaign_id, chapter_id) DO UPDATE
    SET status = CASE
                   WHEN user_campaign_progress.completed_at IS NOT NULL THEN 'completed'
                   WHEN p_completed THEN 'completed'
                   ELSE user_campaign_progress.status
                 END,
        score = GREATEST(COALESCE(user_campaign_progress.score, 0), COALESCE(p_score, 0)),
        xp_earned = GREATEST(COALESCE(user_campaign_progress.xp_earned, 0), COALESCE(p_xp_earned, 0)),
        coins_earned = GREATEST(COALESCE(user_campaign_progress.coins_earned, 0), COALESCE(p_coins_earned, 0)),
        completed_at = COALESCE(user_campaign_progress.completed_at,
                                CASE WHEN p_completed THEN now() ELSE NULL END),
        updated_at = now();

  -- Check whether every required chapter is now completed
  SELECT array_agg(chapter_id) INTO v_done_ids
  FROM public.user_campaign_progress
  WHERE user_id = v_uid
    AND campaign_id = p_campaign_id
    AND completed_at IS NOT NULL;

  v_all_done := (v_done_ids IS NOT NULL) AND (
    SELECT bool_and(rid = ANY(v_done_ids)) FROM unnest(v_required_ids) rid
  );

  IF v_all_done THEN
    INSERT INTO public.user_campaign_completions
      (user_id, campaign_id, campaign_version, source)
    VALUES (v_uid, p_campaign_id, v_campaign_version, 'gameplay')
    ON CONFLICT (user_id, campaign_id) DO NOTHING;
    GET DIAGNOSTICS v_first_time_completion = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'chapter_id', p_chapter_id,
    'campaign_completed', v_all_done,
    'first_time_completion', v_first_time_completion,
    'campaign_version', v_campaign_version,
    'required_chapters', v_required_ids,
    'completed_chapters', v_done_ids
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.record_campaign_progress_v2(TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER) TO authenticated;

-- ---------- 4) list_my_campaign_completions (fast read) -------
CREATE OR REPLACE FUNCTION public.list_my_campaign_completions()
RETURNS TABLE (campaign_id TEXT, campaign_version INTEGER, completed_at TIMESTAMPTZ, source TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT ucc.campaign_id, ucc.campaign_version, ucc.completed_at, ucc.source
    FROM public.user_campaign_completions ucc
    WHERE ucc.user_id = v_uid
    ORDER BY ucc.completed_at ASC;
END; $$;

GRANT EXECUTE ON FUNCTION public.list_my_campaign_completions() TO authenticated;
