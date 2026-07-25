CREATE OR REPLACE FUNCTION public.get_story_bundle_v2(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_story public.stories%ROWTYPE;
  v_is_editor boolean := false;
  v_unlocked boolean := false;
  v_lv text;
  v_prereqs jsonb;
BEGIN
  SELECT * INTO v_story FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_uid IS NOT NULL THEN
    BEGIN v_is_editor := public.is_content_editor();
    EXCEPTION WHEN others THEN v_is_editor := public.has_role(v_uid, 'admin');
    END;
  END IF;

  IF v_story.status <> 'published' AND NOT v_is_editor THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Single source of truth for BOTH guests and authenticated users.
  v_unlocked := public.evaluate_unlock_spec_v2(v_uid, v_story.unlock_spec);

  IF v_is_editor OR v_unlocked THEN
    RETURN jsonb_build_object(
      'ok', true,
      'story', to_jsonb(v_story),
      'scenes', COALESCE((
        SELECT jsonb_agg(to_jsonb(sc) ORDER BY sc.scene_index)
          FROM public.story_scenes sc
         WHERE sc.story_id = v_story.id
      ), '[]'::jsonb),
      'progress', (
        SELECT to_jsonb(p) FROM public.user_story_progress p
         WHERE p.user_id = v_uid AND p.story_id = v_story.id
      ),
      'completed', (v_uid IS NOT NULL) AND EXISTS (
        SELECT 1 FROM public.user_story_completions c
         WHERE c.user_id = v_uid AND c.story_id = v_story.id
      )
    );
  END IF;

  v_lv := COALESCE(v_story.lock_visibility::text, 'visible');
  IF v_lv = 'hidden' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  ELSIF v_lv = 'mystery' THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'locked',
      'story', jsonb_build_object(
        'id', v_story.id, 'slug', v_story.slug,
        'is_locked', true, 'lock_visibility', 'mystery', 'is_redacted', true
      )
    );
  ELSE
    v_prereqs := public._story_prereqs_v2(v_uid, v_story.unlock_spec);
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'locked',
      -- never expose the gating spec nor the internal draft (it embeds full scene text)
      'story', (to_jsonb(v_story) - 'unlock_spec' - 'previous_draft')
                || jsonb_build_object('is_locked', true, 'is_redacted', false),
      'prereqs', v_prereqs
    );
  END IF;
END;
$fn$;