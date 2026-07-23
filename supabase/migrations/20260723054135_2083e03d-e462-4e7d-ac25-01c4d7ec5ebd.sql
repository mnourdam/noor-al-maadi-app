
-- =====================================================================
-- Stories P3 quality pass — draft snapshots, restore, publish warnings
-- =====================================================================

-- 1. Snapshot storage on the story row -------------------------------------
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS previous_draft jsonb,
  ADD COLUMN IF NOT EXISTS previous_draft_at timestamptz;

-- 2. Warnings-aware publish validator --------------------------------------
-- Backwards-compatible: keeps `ok` + `issues`, adds a `warnings` array.
-- `ok` is TRUE when there are no blocking `issues` — warnings never block.
CREATE OR REPLACE FUNCTION public.admin_validate_story_publish(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_story public.stories%ROWTYPE;
  v_issues jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_scene_count int;
  v_bad_media int;
  v_refs jsonb;
  v_primary_len int;
  v_secondary_len int;
  v_missing_title int;
  v_missing_payload int;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_story FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'issues',
      jsonb_build_array(jsonb_build_object('code','story_not_found','message','لم يتم العثور على القصة')),
      'warnings', '[]'::jsonb);
  END IF;

  -- Hard: title required
  IF coalesce(v_story.title_ar,'') = '' THEN
    v_issues := v_issues || jsonb_build_object('code','no_title_ar','message','عنوان عربي مطلوب.');
  END IF;

  -- Hard: at least one scene
  SELECT count(*) INTO v_scene_count FROM public.story_scenes WHERE story_id = p_story_id;
  IF v_scene_count = 0 THEN
    v_issues := v_issues || jsonb_build_object('code','no_scenes','message','القصة لا تحتوي على مشاهد.');
  END IF;

  -- Hard: any attached media must be verified
  SELECT count(*) INTO v_bad_media
    FROM public.story_media
   WHERE story_id = p_story_id AND verified = false
     AND (
       id = v_story.cover_media_id
       OR id IN (SELECT primary_media_id FROM public.story_scenes
                  WHERE story_id = p_story_id AND primary_media_id IS NOT NULL)
     );
  IF v_bad_media > 0 THEN
    v_issues := v_issues || jsonb_build_object('code','unverified_media',
      'message','يوجد وسائط غير متحقق منها في الغلاف أو المشاهد.');
  END IF;

  -- Warning: no cover
  IF v_story.cover_media_id IS NULL THEN
    v_warnings := v_warnings || jsonb_build_object('code','no_cover',
      'message','لا يوجد غلاف. يُنصح بإضافة غلاف قبل النشر.');
  END IF;

  -- Warning: no summary
  IF coalesce(v_story.summary_ar,'') = '' THEN
    v_warnings := v_warnings || jsonb_build_object('code','no_summary',
      'message','لا يوجد ملخّص عربي.');
  END IF;

  -- Warning: no world_slug
  IF v_story.world_slug IS NULL OR v_story.world_slug = '' THEN
    v_warnings := v_warnings || jsonb_build_object('code','no_world',
      'message','لم يتم ربط القصة بأي عالم.');
  END IF;

  -- Warning: scenes with missing title / payload
  SELECT count(*) INTO v_missing_title
    FROM public.story_scenes
   WHERE story_id = p_story_id AND coalesce(title_ar,'') = '';
  IF v_missing_title > 0 THEN
    v_warnings := v_warnings || jsonb_build_object('code','scenes_missing_title',
      'message', v_missing_title || ' مشاهد بدون عنوان.');
  END IF;

  SELECT count(*) INTO v_missing_payload
    FROM public.story_scenes
   WHERE story_id = p_story_id
     AND (payload IS NULL OR payload = '{}'::jsonb);
  IF v_missing_payload > 0 THEN
    v_warnings := v_warnings || jsonb_build_object('code','scenes_missing_body',
      'message', v_missing_payload || ' مشاهد بدون محتوى.');
  END IF;

  -- Warning: source references (metadata.references)
  v_refs := coalesce(v_story.metadata->'references', '{}'::jsonb);
  v_primary_len := jsonb_array_length(coalesce(v_refs->'primary', '[]'::jsonb));
  v_secondary_len := jsonb_array_length(coalesce(v_refs->'secondary', '[]'::jsonb));
  IF v_primary_len + v_secondary_len = 0 THEN
    v_warnings := v_warnings || jsonb_build_object('code','no_references',
      'message','لم يتم توثيق أي مصادر تاريخية.');
  ELSIF v_primary_len = 0 THEN
    v_warnings := v_warnings || jsonb_build_object('code','no_primary_references',
      'message','لا توجد مصادر أولية موثّقة.');
  END IF;

  RETURN jsonb_build_object(
    'ok', (jsonb_array_length(v_issues) = 0),
    'issues', v_issues,
    'warnings', v_warnings
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_validate_story_publish(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_validate_story_publish(text) TO authenticated;


-- 3. Snapshot the previous draft on publish transition ---------------------
CREATE OR REPLACE FUNCTION public.admin_set_story_status(
  p_story_id text, p_status text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_validation jsonb;
  v_prev_status text;
  v_snapshot jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
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
      RETURN jsonb_build_object('ok', false, 'reason', 'validation_failed',
                                'validation', v_validation);
    END IF;

    -- Snapshot the previous draft state (metadata + all scenes) so we
    -- can restore it later. Purely additive; never overwrites the LIVE
    -- rows themselves.
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
         published_at = CASE
           WHEN p_status = 'published' AND published_at IS NULL THEN now()
           ELSE published_at
         END,
         updated_at = now()
   WHERE id = p_story_id;

  RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_story_status(text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_story_status(text,text) TO authenticated;


-- 4. Restore the previous draft snapshot -----------------------------------
CREATE OR REPLACE FUNCTION public.admin_restore_previous_draft(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_snapshot jsonb;
  v_story jsonb;
  v_scene jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT previous_draft INTO v_snapshot
    FROM public.stories WHERE id = p_story_id;
  IF v_snapshot IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_snapshot');
  END IF;

  v_story := v_snapshot->'story';

  -- Restore mutable metadata fields. Stable identity + timestamps stay.
  UPDATE public.stories SET
    slug = coalesce(v_story->>'slug', slug),
    title_ar = coalesce(v_story->>'title_ar', title_ar),
    title_en = v_story->>'title_en',
    summary_ar = v_story->>'summary_ar',
    summary_en = v_story->>'summary_en',
    world_slug = v_story->>'world_slug',
    era = v_story->>'era',
    display_order = coalesce((v_story->>'display_order')::int, display_order),
    xp_reward = coalesce((v_story->>'xp_reward')::int, xp_reward),
    dinar_reward = coalesce((v_story->>'dinar_reward')::int, dinar_reward),
    cover_media_id = CASE
      WHEN v_story ? 'cover_media_id' AND v_story->>'cover_media_id' IS NOT NULL
      THEN (v_story->>'cover_media_id')::uuid
      ELSE NULL
    END,
    unlock_spec = coalesce(v_story->'unlock_spec', unlock_spec),
    metadata = coalesce(v_story->'metadata', metadata),
    status = 'draft',
    updated_at = now()
  WHERE id = p_story_id;

  -- Replace scenes with snapshot scenes. Stable IDs preserved so any
  -- external reference (progress, achievements) that keyed on scene id
  -- still resolves.
  DELETE FROM public.story_scenes WHERE story_id = p_story_id;
  FOR v_scene IN SELECT * FROM jsonb_array_elements(v_snapshot->'scenes')
  LOOP
    INSERT INTO public.story_scenes(
      id, story_id, scene_index, scene_type,
      title_ar, title_en, payload, primary_media_id,
      created_at, updated_at
    ) VALUES (
      v_scene->>'id',
      p_story_id,
      (v_scene->>'scene_index')::int,
      v_scene->>'scene_type',
      v_scene->>'title_ar',
      v_scene->>'title_en',
      coalesce(v_scene->'payload', '{}'::jsonb),
      CASE WHEN v_scene ? 'primary_media_id' AND v_scene->>'primary_media_id' IS NOT NULL
           THEN (v_scene->>'primary_media_id')::uuid ELSE NULL END,
      coalesce((v_scene->>'created_at')::timestamptz, now()),
      now()
    );
  END LOOP;

  -- Consume the snapshot so it can't be restored twice by accident.
  UPDATE public.stories
     SET previous_draft = NULL, previous_draft_at = NULL
   WHERE id = p_story_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_restore_previous_draft(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_restore_previous_draft(text) TO authenticated;


-- 5. Extend admin_get_story_full to expose snapshot presence ---------------
CREATE OR REPLACE FUNCTION public.admin_get_story_full(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stories WHERE id = p_story_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'story_not_found');
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'story', (SELECT to_jsonb(s.*) - 'previous_draft'
                FROM public.stories s WHERE s.id = p_story_id),
    'scenes', coalesce((
      SELECT jsonb_agg(to_jsonb(c.*) ORDER BY c.scene_index)
        FROM public.story_scenes c
       WHERE c.story_id = p_story_id
    ), '[]'::jsonb),
    'media', coalesce((
      SELECT jsonb_agg(to_jsonb(m.*) ORDER BY m.created_at)
        FROM public.story_media m
       WHERE m.story_id = p_story_id
    ), '[]'::jsonb),
    'has_previous_draft', (
      SELECT previous_draft IS NOT NULL FROM public.stories WHERE id = p_story_id
    ),
    'previous_draft_at', (
      SELECT previous_draft_at FROM public.stories WHERE id = p_story_id
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_story_full(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_story_full(text) TO authenticated;


-- 6. Public list of published stories for the P4 /stories index -----------
CREATE OR REPLACE FUNCTION public.list_published_stories()
RETURNS TABLE(
  id text, slug text, title_ar text, title_en text,
  summary_ar text, world_slug text, era text,
  display_order integer, xp_reward integer, dinar_reward integer,
  cover_media_id uuid, content_version integer, published_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, slug, title_ar, title_en, summary_ar, world_slug, era,
         display_order, xp_reward, dinar_reward, cover_media_id,
         content_version, published_at
    FROM public.stories
   WHERE status = 'published'
   ORDER BY display_order ASC, published_at DESC;
$$;
REVOKE ALL ON FUNCTION public.list_published_stories() FROM public;
GRANT EXECUTE ON FUNCTION public.list_published_stories() TO anon, authenticated;
