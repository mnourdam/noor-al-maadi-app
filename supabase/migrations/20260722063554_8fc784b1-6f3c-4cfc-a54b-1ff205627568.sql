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
  v_completion_completed_at timestamptz := NULL;
  v_chapter_completed_at timestamptz := NULL;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  IF p_campaign_id IS NULL OR length(trim(p_campaign_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_campaign_id');
  END IF;
  IF p_chapter_id IS NULL OR length(trim(p_chapter_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_chapter_id');
  END IF;

  SELECT data, COALESCE(content_version, 1) INTO v_camp, v_campaign_version
  FROM public.admin_campaigns WHERE id = p_campaign_id;

  IF v_camp IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_not_found');
  END IF;

  SELECT array_agg(elem->>'id') INTO v_required_ids
  FROM jsonb_array_elements(COALESCE(v_camp->'chapters', '[]'::jsonb)) elem
  WHERE elem->>'id' IS NOT NULL;

  IF v_required_ids IS NULL OR NOT (p_chapter_id = ANY (v_required_ids)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'chapter_not_in_campaign');
  END IF;

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

  SELECT completed_at INTO v_chapter_completed_at
  FROM public.user_campaign_progress
  WHERE user_id = v_uid
    AND campaign_id = p_campaign_id
    AND chapter_id = p_chapter_id;

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
    ON CONFLICT (user_id, campaign_id) DO UPDATE
      SET campaign_version = COALESCE(public.user_campaign_completions.campaign_version, EXCLUDED.campaign_version),
          source = CASE
            WHEN public.user_campaign_completions.source IS NULL OR public.user_campaign_completions.source = '' THEN EXCLUDED.source
            ELSE public.user_campaign_completions.source
          END,
          updated_at = now();
    GET DIAGNOSTICS v_first_time_completion = ROW_COUNT;

    SELECT completed_at INTO v_completion_completed_at
    FROM public.user_campaign_completions
    WHERE user_id = v_uid AND campaign_id = p_campaign_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'campaign_id', p_campaign_id,
    'chapter_id', p_chapter_id,
    'chapter_completed', v_chapter_completed_at IS NOT NULL,
    'chapter_completed_at', v_chapter_completed_at,
    'campaign_completed', v_all_done,
    'campaign_completion_updated', v_all_done,
    'campaign_completion_completed_at', v_completion_completed_at,
    'first_time_completion', v_first_time_completion,
    'campaign_version', v_campaign_version,
    'required_chapters', v_required_ids,
    'completed_chapters', v_done_ids
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.record_campaign_progress_v2(TEXT, TEXT, BOOLEAN, INTEGER, INTEGER, INTEGER) TO authenticated;

UPDATE public.user_campaign_completions ucc
SET campaign_version = COALESCE(ucc.campaign_version, ac.content_version, 1),
    updated_at = now()
FROM public.admin_campaigns ac
WHERE ac.id = ucc.campaign_id
  AND ucc.campaign_version IS NULL;