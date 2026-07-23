
CREATE OR REPLACE FUNCTION public.admin_slug_available(
  p_slug text, p_ignore_id text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.stories
     WHERE slug = p_slug
       AND (p_ignore_id IS NULL OR id <> p_ignore_id)
  );
END; $$;
REVOKE ALL ON FUNCTION public.admin_slug_available(text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_slug_available(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_story_delete_impact(p_ids text[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rows jsonb;
  v_totals jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'totals', jsonb_build_object());
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT
        s.id,
        s.slug,
        s.title_ar,
        s.status,
        (SELECT count(*)::int FROM public.story_scenes sc WHERE sc.story_id = s.id) AS scenes,
        (SELECT count(*)::int FROM public.story_media  m
          WHERE m.story_id = s.id AND m.ownership = 'story-owned') AS owned_media,
        (SELECT count(*)::int FROM public.story_media  m
          WHERE m.story_id = s.id AND m.ownership = 'shared')     AS shared_media,
        (SELECT count(*)::int FROM public.user_story_progress p
          WHERE p.story_id = s.id) AS progress_rows,
        (SELECT count(*)::int FROM public.user_story_completions c
          WHERE c.story_id = s.id) AS completions,
        (SELECT count(*)::int FROM public.social_comments c
          WHERE c.anchor_type = 'story' AND c.anchor_id = s.id
            AND (c.hidden IS DISTINCT FROM true)) AS comments,
        (SELECT count(*)::int FROM public.social_reactions r
          WHERE r.anchor_type = 'story' AND r.anchor_id = s.id) AS reactions
      FROM public.stories s
      WHERE s.id = ANY(p_ids)
    ) x;

  SELECT jsonb_build_object(
    'stories',      COALESCE(jsonb_array_length(v_rows), 0),
    'published',    COALESCE(SUM(CASE WHEN (r->>'status') = 'published' THEN 1 ELSE 0 END), 0),
    'draft',        COALESCE(SUM(CASE WHEN (r->>'status') = 'draft'     THEN 1 ELSE 0 END), 0),
    'archived',     COALESCE(SUM(CASE WHEN (r->>'status') = 'archived'  THEN 1 ELSE 0 END), 0),
    'scenes',       COALESCE(SUM((r->>'scenes')::int), 0),
    'owned_media',  COALESCE(SUM((r->>'owned_media')::int), 0),
    'shared_media', COALESCE(SUM((r->>'shared_media')::int), 0),
    'progress',     COALESCE(SUM((r->>'progress_rows')::int), 0),
    'completions',  COALESCE(SUM((r->>'completions')::int), 0),
    'comments',     COALESCE(SUM((r->>'comments')::int), 0),
    'reactions',    COALESCE(SUM((r->>'reactions')::int), 0)
  ) INTO v_totals
  FROM jsonb_array_elements(v_rows) r;

  RETURN jsonb_build_object('items', v_rows, 'totals', v_totals);
END; $$;
REVOKE ALL ON FUNCTION public.admin_story_delete_impact(text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_story_delete_impact(text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_story(
  p_story_id text,
  p_mode     text DEFAULT 'archive',
  p_force    boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_progress int;
  v_completions int;
  v_paths jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_status FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'story_not_found');
  END IF;

  IF p_mode = 'archive' THEN
    UPDATE public.stories SET status = 'archived', updated_at = now()
     WHERE id = p_story_id;
    RETURN jsonb_build_object('ok', true, 'mode', 'archive');
  END IF;

  IF p_mode <> 'hard' THEN
    RAISE EXCEPTION 'invalid_mode:%', p_mode;
  END IF;

  SELECT count(*) INTO v_progress
    FROM public.user_story_progress WHERE story_id = p_story_id;
  SELECT count(*) INTO v_completions
    FROM public.user_story_completions WHERE story_id = p_story_id;

  IF (v_progress + v_completions) > 0 AND NOT p_force THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'has_player_data',
      'progress', v_progress, 'completions', v_completions
    );
  END IF;

  UPDATE public.stories SET cover_media_id = NULL WHERE id = p_story_id;
  UPDATE public.story_scenes SET primary_media_id = NULL WHERE story_id = p_story_id;

  WITH deleted AS (
    DELETE FROM public.story_media
     WHERE story_id = p_story_id AND ownership = 'story-owned'
     RETURNING storage_bucket, storage_path
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', storage_bucket, 'path', storage_path)), '[]'::jsonb)
    INTO v_paths
    FROM deleted;

  DELETE FROM public.stories WHERE id = p_story_id;

  RETURN jsonb_build_object('ok', true, 'mode', 'hard', 'storage', v_paths);
END; $$;
REVOKE ALL ON FUNCTION public.admin_delete_story(text,text,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_story(text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_export_stories(p_ids text[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids text[];
  v_items jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    SELECT array_agg(id) INTO v_ids FROM public.stories;
  ELSE
    v_ids := p_ids;
  END IF;
  IF v_ids IS NULL THEN
    RETURN jsonb_build_object('version', 1, 'exported_at', now(), 'stories', '[]'::jsonb);
  END IF;

  SELECT jsonb_agg(item ORDER BY item->>'id')
    INTO v_items
    FROM (
      SELECT jsonb_build_object(
        'id', s.id,
        'slug', s.slug,
        'title_ar', s.title_ar,
        'title_en', s.title_en,
        'summary_ar', s.summary_ar,
        'summary_en', s.summary_en,
        'world_slug', s.world_slug,
        'era', s.era,
        'display_order', s.display_order,
        'status', s.status,
        'content_version', s.content_version,
        'unlock_spec', s.unlock_spec,
        'cover_media_id', s.cover_media_id,
        'xp_reward', s.xp_reward,
        'dinar_reward', s.dinar_reward,
        'metadata', s.metadata,
        'scenes', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', sc.id,
            'scene_index', sc.scene_index,
            'scene_type', sc.scene_type,
            'title_ar', sc.title_ar,
            'title_en', sc.title_en,
            'payload', sc.payload,
            'primary_media_id', sc.primary_media_id
          ) ORDER BY sc.scene_index)
          FROM public.story_scenes sc WHERE sc.story_id = s.id
        ), '[]'::jsonb),
        'media', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', m.id,
            'kind', m.kind,
            'storage_bucket', m.storage_bucket,
            'storage_path', m.storage_path,
            'mime_type', m.mime_type,
            'byte_size', m.byte_size,
            'width', m.width,
            'height', m.height,
            'checksum_sha256', m.checksum_sha256,
            'preset', m.preset,
            'processing_version', m.processing_version,
            'ownership', m.ownership,
            'metadata', m.metadata
          ) ORDER BY m.created_at)
          FROM public.story_media m
          WHERE m.story_id = s.id
             OR m.id = s.cover_media_id
             OR m.id IN (SELECT primary_media_id FROM public.story_scenes
                          WHERE story_id = s.id AND primary_media_id IS NOT NULL)
        ), '[]'::jsonb)
      ) AS item
      FROM public.stories s
      WHERE s.id = ANY(v_ids)
    ) t;

  RETURN jsonb_build_object(
    'version', 1,
    'exported_at', now(),
    'stories', COALESCE(v_items, '[]'::jsonb)
  );
END; $$;
REVOKE ALL ON FUNCTION public.admin_export_stories(text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_export_stories(text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_import_stories_preview(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_items jsonb := '[]'::jsonb;
  v_in jsonb;
  v_id text;
  v_slug text;
  v_existing_id text;
  v_kind text;
  v_issues jsonb;
  v_missing_media jsonb;
  v_stories jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_stories := COALESCE(p_payload->'stories', '[]'::jsonb);

  FOR v_in IN SELECT * FROM jsonb_array_elements(v_stories) LOOP
    v_issues := '[]'::jsonb;
    v_missing_media := '[]'::jsonb;
    v_kind := 'invalid';

    v_id := NULLIF(v_in->>'id', '');
    v_slug := NULLIF(v_in->>'slug', '');

    IF v_id IS NULL OR v_id !~ '^[a-z0-9_-]{3,80}$' THEN
      v_issues := v_issues || jsonb_build_array('invalid_id');
    ELSIF v_slug IS NULL THEN
      v_issues := v_issues || jsonb_build_array('missing_slug');
    ELSIF COALESCE(v_in->>'title_ar','') = '' THEN
      v_issues := v_issues || jsonb_build_array('missing_title_ar');
    ELSE
      SELECT id INTO v_existing_id FROM public.stories WHERE id = v_id;
      IF v_existing_id IS NULL THEN
        PERFORM 1 FROM public.stories WHERE slug = v_slug;
        IF FOUND THEN
          v_kind := 'conflict';
          v_issues := v_issues || jsonb_build_array('slug_taken');
        ELSE
          v_kind := 'new';
        END IF;
      ELSE
        v_kind := 'updated';
      END IF;

      SELECT COALESCE(jsonb_agg(x.ref), '[]'::jsonb) INTO v_missing_media FROM (
        SELECT DISTINCT ref
        FROM (
          SELECT NULLIF(v_in->>'cover_media_id','')::text AS ref
          UNION ALL
          SELECT NULLIF(sc->>'primary_media_id','')::text
            FROM jsonb_array_elements(COALESCE(v_in->'scenes','[]'::jsonb)) sc
        ) refs
        WHERE ref IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.story_media m WHERE m.id::text = ref)
      ) x;
    END IF;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_id,
      'slug', v_slug,
      'title_ar', v_in->>'title_ar',
      'kind', v_kind,
      'issues', v_issues,
      'missing_media', v_missing_media,
      'scene_count', COALESCE(jsonb_array_length(v_in->'scenes'), 0)
    ));
  END LOOP;

  RETURN jsonb_build_object('items', v_items);
END; $$;
REVOKE ALL ON FUNCTION public.admin_import_stories_preview(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_import_stories_preview(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_import_stories_apply(
  p_payload jsonb,
  p_options jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_skip_existing boolean := COALESCE((p_options->>'skip_existing')::boolean, false);
  v_sync_scenes   boolean := COALESCE((p_options->>'sync_scenes')::boolean,   true);
  v_publish       boolean := COALESCE((p_options->>'publish')::boolean,       false);
  v_results jsonb := '[]'::jsonb;
  v_story jsonb;
  v_id text;
  v_slug text;
  v_existing_id text;
  v_scene jsonb;
  v_kept text[];
  v_err text;
  v_publish_res jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR v_story IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'stories','[]'::jsonb)) LOOP
    v_id   := NULLIF(v_story->>'id','');
    v_slug := NULLIF(v_story->>'slug','');
    v_kept := ARRAY[]::text[];

    BEGIN
      IF v_id IS NULL OR v_id !~ '^[a-z0-9_-]{3,80}$' THEN
        RAISE EXCEPTION 'invalid_id';
      END IF;
      IF v_slug IS NULL THEN
        RAISE EXCEPTION 'missing_slug';
      END IF;

      SELECT id INTO v_existing_id FROM public.stories WHERE id = v_id;

      IF v_existing_id IS NOT NULL AND v_skip_existing THEN
        v_results := v_results || jsonb_build_array(jsonb_build_object(
          'id', v_id, 'ok', true, 'action', 'skipped'
        ));
        CONTINUE;
      END IF;

      INSERT INTO public.stories AS s (
        id, slug, title_ar, title_en, summary_ar, summary_en,
        world_slug, era, display_order, unlock_spec,
        cover_media_id, xp_reward, dinar_reward, metadata
      ) VALUES (
        v_id,
        v_slug,
        COALESCE(v_story->>'title_ar',''),
        NULLIF(v_story->>'title_en',''),
        NULLIF(v_story->>'summary_ar',''),
        NULLIF(v_story->>'summary_en',''),
        NULLIF(v_story->>'world_slug',''),
        NULLIF(v_story->>'era',''),
        COALESCE((v_story->>'display_order')::integer, 0),
        COALESCE(v_story->'unlock_spec', '{"type":"always"}'::jsonb),
        NULLIF(v_story->>'cover_media_id','')::uuid,
        COALESCE((v_story->>'xp_reward')::integer, 0),
        COALESCE((v_story->>'dinar_reward')::integer, 0),
        COALESCE(v_story->'metadata', '{}'::jsonb)
      )
      ON CONFLICT (id) DO UPDATE SET
        slug           = EXCLUDED.slug,
        title_ar       = EXCLUDED.title_ar,
        title_en       = EXCLUDED.title_en,
        summary_ar     = EXCLUDED.summary_ar,
        summary_en     = EXCLUDED.summary_en,
        world_slug     = EXCLUDED.world_slug,
        era            = EXCLUDED.era,
        display_order  = EXCLUDED.display_order,
        unlock_spec    = EXCLUDED.unlock_spec,
        cover_media_id = EXCLUDED.cover_media_id,
        xp_reward      = EXCLUDED.xp_reward,
        dinar_reward   = EXCLUDED.dinar_reward,
        metadata       = EXCLUDED.metadata,
        updated_at     = now();

      FOR v_scene IN SELECT * FROM jsonb_array_elements(COALESCE(v_story->'scenes','[]'::jsonb)) LOOP
        IF NULLIF(v_scene->>'id','') IS NULL THEN
          RAISE EXCEPTION 'invalid_scene_id';
        END IF;
        v_kept := array_append(v_kept, v_scene->>'id');
        INSERT INTO public.story_scenes AS x (
          id, story_id, scene_index, scene_type,
          title_ar, title_en, payload, primary_media_id
        ) VALUES (
          v_scene->>'id',
          v_id,
          COALESCE((v_scene->>'scene_index')::int, 0),
          COALESCE(v_scene->>'scene_type', 'reading'),
          NULLIF(v_scene->>'title_ar',''),
          NULLIF(v_scene->>'title_en',''),
          COALESCE(v_scene->'payload', '{}'::jsonb),
          NULLIF(v_scene->>'primary_media_id','')::uuid
        )
        ON CONFLICT (id) DO UPDATE SET
          story_id         = EXCLUDED.story_id,
          scene_index      = EXCLUDED.scene_index,
          scene_type       = EXCLUDED.scene_type,
          title_ar         = EXCLUDED.title_ar,
          title_en         = EXCLUDED.title_en,
          payload          = EXCLUDED.payload,
          primary_media_id = EXCLUDED.primary_media_id,
          updated_at       = now();
      END LOOP;

      IF v_sync_scenes THEN
        DELETE FROM public.story_scenes
         WHERE story_id = v_id
           AND NOT (id = ANY(v_kept));
      END IF;

      IF v_publish THEN
        v_publish_res := public.admin_set_story_status(v_id, 'published');
        IF NOT (v_publish_res->>'ok')::boolean THEN
          v_results := v_results || jsonb_build_array(jsonb_build_object(
            'id', v_id, 'ok', true,
            'action', CASE WHEN v_existing_id IS NULL THEN 'created' ELSE 'updated' END,
            'publish', v_publish_res
          ));
          CONTINUE;
        END IF;
      END IF;

      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', v_id, 'ok', true,
        'action', CASE WHEN v_existing_id IS NULL THEN 'created' ELSE 'updated' END,
        'scenes', COALESCE(array_length(v_kept,1),0),
        'published', v_publish
      ));
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'id', v_id, 'ok', false, 'action', 'error', 'error', v_err
      ));
    END;
  END LOOP;

  RETURN jsonb_build_object('items', v_results);
END; $$;
REVOKE ALL ON FUNCTION public.admin_import_stories_apply(jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_import_stories_apply(jsonb, jsonb) TO authenticated;
