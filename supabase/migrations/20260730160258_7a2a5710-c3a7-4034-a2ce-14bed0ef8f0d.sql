CREATE OR REPLACE FUNCTION public.admin_set_story_status(p_story_id text, p_status text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_validation jsonb;
  v_prev_status text;
  v_snapshot jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('draft','published','archived') THEN
    RAISE EXCEPTION 'invalid_status:%', p_status;
  END IF;
  SELECT status INTO v_prev_status FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_not_found';
  END IF;

  IF p_status = 'published' THEN
    v_validation := public.admin_validate_story_publish(p_story_id);
    IF NOT (v_validation->>'ok')::boolean THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'validation_failed', 'validation', v_validation);
    END IF;

    SELECT jsonb_build_object(
      'snapshotted_at', now(),
      'snapshotted_by', v_uid,
      'previous_status', v_prev_status,
      'story', to_jsonb(s.*) - 'previous_draft' - 'previous_draft_at',
      'scenes', coalesce((
        SELECT jsonb_agg(to_jsonb(c.*) ORDER BY c.scene_index)
        FROM public.story_scenes c
        WHERE c.story_id = p_story_id
      ), '[]'::jsonb)
    ) INTO v_snapshot
    FROM public.stories s WHERE s.id = p_story_id;

    UPDATE public.stories
    SET previous_draft = v_snapshot,
        previous_draft_at = now()
    WHERE id = p_story_id;
  END IF;

  UPDATE public.stories
  SET status = p_status,
      production_status = CASE
        WHEN p_status IN ('published', 'archived') THEN 'completed'::public.story_production_status
        ELSE production_status
      END,
      published_at = CASE
        WHEN p_status = 'published' AND published_at IS NULL THEN now()
        ELSE published_at
      END,
      updated_at = now()
  WHERE id = p_story_id;

  RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$function$;

UPDATE public.stories
SET production_status = 'completed'::public.story_production_status,
    updated_at = now()
WHERE status = 'published'
  AND production_status IS DISTINCT FROM 'completed'::public.story_production_status;