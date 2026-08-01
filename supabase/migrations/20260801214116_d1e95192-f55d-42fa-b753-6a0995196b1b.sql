CREATE OR REPLACE FUNCTION public.get_story_bundle_v2(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_story public.stories%ROWTYPE;
  v_unlocked boolean := false;
  v_lv text;
  v_prereqs jsonb;
BEGIN
  SELECT *
    INTO v_story
    FROM public.stories
   WHERE id = p_story_id
     AND status = 'published';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Campaign intros are not library content: they only play inside their campaign.
  IF public.story_is_campaign_intro(v_story.id, v_story.metadata, v_story.tags) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'campaign_intro',
      'campaign_id', public.campaign_id_for_intro_story(v_story.id)
    );
  END IF;

  v_unlocked := public.evaluate_unlock_spec_v2(v_uid, v_story.unlock_spec);

  IF v_unlocked THEN
    RETURN jsonb_build_object(
      'ok', true,
      'story', to_jsonb(v_story),
      'scenes', COALESCE((
        SELECT jsonb_agg(to_jsonb(sc) ORDER BY sc.scene_index)
          FROM public.story_scenes sc
         WHERE sc.story_id = v_story.id
      ), '[]'::jsonb),
      'progress', (
        SELECT to_jsonb(p)
          FROM public.user_story_progress p
         WHERE p.user_id = v_uid
           AND p.story_id = v_story.id
      ),
      'completed', (v_uid IS NOT NULL) AND EXISTS (
        SELECT 1
          FROM public.user_story_completions c
         WHERE c.user_id = v_uid
           AND c.story_id = v_story.id
      )
    );
  END IF;

  v_lv := COALESCE(v_story.lock_visibility::text, 'visible');
  IF v_lv = 'hidden' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  ELSIF v_lv = 'mystery' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'story', jsonb_build_object(
        'id', v_story.id,
        'slug', v_story.slug,
        'is_locked', true,
        'lock_visibility', 'mystery',
        'is_redacted', true
      )
    );
  ELSE
    v_prereqs := public._story_prereqs_v2(v_uid, v_story.unlock_spec);
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'story', (to_jsonb(v_story) - 'unlock_spec' - 'previous_draft')
                || jsonb_build_object('is_locked', true, 'is_redacted', false),
      'prereqs', v_prereqs
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_story_access(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_story public.stories%ROWTYPE;
  v_unlocked boolean := false;
BEGIN
  SELECT *
    INTO v_story
    FROM public.stories
   WHERE id = p_story_id
     AND status = 'published';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF public.story_is_campaign_intro(v_story.id, v_story.metadata, v_story.tags) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'campaign_intro',
      'campaign_id', public.campaign_id_for_intro_story(v_story.id)
    );
  END IF;

  v_unlocked := public.evaluate_unlock_spec_v2(v_uid, v_story.unlock_spec);

  IF NOT v_unlocked THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'locked',
      'story', to_jsonb(v_story) - 'unlock_spec' - 'previous_draft'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'story', to_jsonb(v_story),
    'scenes', COALESCE((
      SELECT jsonb_agg(to_jsonb(sc) ORDER BY sc.scene_index)
        FROM public.story_scenes sc
       WHERE sc.story_id = v_story.id
    ), '[]'::jsonb),
    'progress', (
      SELECT to_jsonb(p)
        FROM public.user_story_progress p
       WHERE p.user_id = v_uid
         AND p.story_id = v_story.id
    ),
    'completed', (v_uid IS NOT NULL) AND EXISTS (
      SELECT 1
        FROM public.user_story_completions c
       WHERE c.user_id = v_uid
         AND c.story_id = v_story.id
    )
  );
END;
$$;
