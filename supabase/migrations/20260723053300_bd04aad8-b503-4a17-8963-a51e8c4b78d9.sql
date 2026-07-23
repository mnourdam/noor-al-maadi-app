
DROP FUNCTION IF EXISTS public.admin_list_story_media_orphans(integer);

-- =====================================================================
-- Stories P2 freeze notes + P3 admin authoring
-- =====================================================================

ALTER TABLE public.story_media
  ADD COLUMN IF NOT EXISTS ownership text NOT NULL DEFAULT 'story-owned'
    CHECK (ownership IN ('story-owned','shared'));

CREATE INDEX IF NOT EXISTS story_media_ownership_idx
  ON public.story_media (ownership);

CREATE OR REPLACE FUNCTION public.story_media_reference_count(p_media_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    (SELECT count(*) FROM public.stories       WHERE cover_media_id   = p_media_id)
  + (SELECT count(*) FROM public.story_scenes  WHERE primary_media_id = p_media_id)
  )::integer;
$$;
REVOKE ALL ON FUNCTION public.story_media_reference_count(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.story_media_reference_count(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_story_media(p_media_id uuid)
RETURNS TABLE(storage_bucket text, storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_refs integer;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_refs := public.story_media_reference_count(p_media_id);
  IF v_refs > 0 THEN
    RAISE EXCEPTION 'media_in_use';
  END IF;
  RETURN QUERY
  DELETE FROM public.story_media
   WHERE id = p_media_id
  RETURNING story_media.storage_bucket, story_media.storage_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_story_media_orphans(
  p_min_age_minutes integer DEFAULT 60
) RETURNS TABLE(
  id              uuid,
  storage_bucket  text,
  storage_path    text,
  byte_size       integer,
  kind            text,
  preset          text,
  verified        boolean,
  ownership       text,
  age_minutes     integer
)
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
  RETURN QUERY
  SELECT m.id, m.storage_bucket, m.storage_path, m.byte_size,
         m.kind, m.preset, m.verified, m.ownership,
         (EXTRACT(EPOCH FROM (now() - m.created_at))::integer / 60) AS age_minutes
    FROM public.story_media m
   WHERE m.ownership = 'story-owned'
     AND m.created_at < now() - make_interval(mins => GREATEST(p_min_age_minutes, 0))
     AND public.story_media_reference_count(m.id) = 0;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_story_media_orphans(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_story_media_orphans(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_story_full(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_story public.stories;
  v_scenes jsonb;
  v_media  jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_story FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'story_not_found');
  END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.scene_index), '[]'::jsonb)
    INTO v_scenes
    FROM public.story_scenes s
   WHERE s.story_id = p_story_id;
  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at), '[]'::jsonb)
    INTO v_media
    FROM public.story_media m
   WHERE m.story_id = p_story_id
      OR m.id IN (SELECT primary_media_id FROM public.story_scenes
                    WHERE story_id = p_story_id AND primary_media_id IS NOT NULL)
      OR m.id = v_story.cover_media_id;
  RETURN jsonb_build_object(
    'ok', true,
    'story', to_jsonb(v_story),
    'scenes', v_scenes,
    'media', v_media
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_story_full(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_story_full(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_story(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  text := NULLIF(p_payload->>'id','');
  v_slug text := NULLIF(p_payload->>'slug','');
  v_row public.stories;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_id IS NULL OR v_slug IS NULL THEN
    RAISE EXCEPTION 'invalid_payload:id_and_slug_required';
  END IF;
  IF v_id !~ '^[a-z0-9_-]{3,80}$' THEN
    RAISE EXCEPTION 'invalid_id_format';
  END IF;

  INSERT INTO public.stories AS s (
    id, slug, title_ar, title_en, summary_ar, summary_en,
    world_slug, era, display_order, unlock_spec,
    cover_media_id, xp_reward, dinar_reward, metadata
  ) VALUES (
    v_id,
    v_slug,
    COALESCE(p_payload->>'title_ar', ''),
    NULLIF(p_payload->>'title_en',''),
    NULLIF(p_payload->>'summary_ar',''),
    NULLIF(p_payload->>'summary_en',''),
    NULLIF(p_payload->>'world_slug',''),
    NULLIF(p_payload->>'era',''),
    COALESCE((p_payload->>'display_order')::integer, 0),
    COALESCE(p_payload->'unlock_spec', '{"type":"always"}'::jsonb),
    NULLIF(p_payload->>'cover_media_id','')::uuid,
    COALESCE((p_payload->>'xp_reward')::integer, 0),
    COALESCE((p_payload->>'dinar_reward')::integer, 0),
    COALESCE(p_payload->'metadata', '{}'::jsonb)
  )
  ON CONFLICT (id) DO UPDATE SET
    slug            = EXCLUDED.slug,
    title_ar        = EXCLUDED.title_ar,
    title_en        = EXCLUDED.title_en,
    summary_ar      = EXCLUDED.summary_ar,
    summary_en      = EXCLUDED.summary_en,
    world_slug      = EXCLUDED.world_slug,
    era             = EXCLUDED.era,
    display_order   = EXCLUDED.display_order,
    unlock_spec     = EXCLUDED.unlock_spec,
    cover_media_id  = EXCLUDED.cover_media_id,
    xp_reward       = EXCLUDED.xp_reward,
    dinar_reward    = EXCLUDED.dinar_reward,
    metadata        = EXCLUDED.metadata,
    updated_at      = now()
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok', true, 'story', to_jsonb(v_row));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_upsert_story(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_upsert_story(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_upsert_story_scene(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_story_id text := NULLIF(p_payload->>'story_id','');
  v_id       text := NULLIF(p_payload->>'id','');
  v_row public.story_scenes;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_story_id IS NULL OR v_id IS NULL THEN
    RAISE EXCEPTION 'invalid_payload:story_id_and_id_required';
  END IF;
  IF v_id !~ '^[a-z0-9_-]{1,120}$' THEN
    RAISE EXCEPTION 'invalid_id_format';
  END IF;
  PERFORM 1 FROM public.stories WHERE id = v_story_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_not_found';
  END IF;

  INSERT INTO public.story_scenes AS s (
    id, story_id, scene_index, scene_type,
    title_ar, title_en, payload, primary_media_id
  ) VALUES (
    v_id, v_story_id,
    COALESCE((p_payload->>'scene_index')::integer, 0),
    COALESCE(p_payload->>'scene_type', 'reading'),
    NULLIF(p_payload->>'title_ar',''),
    NULLIF(p_payload->>'title_en',''),
    COALESCE(p_payload->'payload', '{}'::jsonb),
    NULLIF(p_payload->>'primary_media_id','')::uuid
  )
  ON CONFLICT (id) DO UPDATE SET
    story_id         = EXCLUDED.story_id,
    scene_index      = EXCLUDED.scene_index,
    scene_type       = EXCLUDED.scene_type,
    title_ar         = EXCLUDED.title_ar,
    title_en         = EXCLUDED.title_en,
    payload          = EXCLUDED.payload,
    primary_media_id = EXCLUDED.primary_media_id,
    updated_at       = now()
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok', true, 'scene', to_jsonb(v_row));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_upsert_story_scene(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_upsert_story_scene(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_story_scene(
  p_story_id text, p_scene_id text
) RETURNS boolean
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
  DELETE FROM public.story_scenes
   WHERE id = p_scene_id AND story_id = p_story_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_story_scene(text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_story_scene(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_reorder_story_scenes(
  p_story_id text, p_ordered_ids text[]
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_len integer;
  v_existing integer;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_len := coalesce(array_length(p_ordered_ids, 1), 0);
  SELECT count(*) INTO v_existing FROM public.story_scenes WHERE story_id = p_story_id;
  IF v_len <> v_existing THEN
    RAISE EXCEPTION 'reorder_mismatch:expected_% got_%', v_existing, v_len;
  END IF;

  UPDATE public.story_scenes
     SET scene_index = -1 - scene_index
   WHERE story_id = p_story_id;

  FOR i IN 1..v_len LOOP
    UPDATE public.story_scenes
       SET scene_index = i - 1,
           updated_at = now()
     WHERE story_id = p_story_id
       AND id = p_ordered_ids[i];
  END LOOP;

  PERFORM 1 FROM public.story_scenes
    WHERE story_id = p_story_id AND scene_index < 0 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'reorder_missing_ids';
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reorder_story_scenes(text,text[]) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_reorder_story_scenes(text,text[]) TO authenticated;

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
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('draft','published','archived') THEN
    RAISE EXCEPTION 'invalid_status:%', p_status;
  END IF;
  PERFORM 1 FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'story_not_found';
  END IF;
  IF p_status = 'published' THEN
    v_validation := public.admin_validate_story_publish(p_story_id);
    IF NOT (v_validation->>'ok')::boolean THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'validation_failed',
                                'validation', v_validation);
    END IF;
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

CREATE OR REPLACE FUNCTION public.admin_list_stories()
RETURNS TABLE(
  id text, slug text, title_ar text, title_en text,
  status text, world_slug text, era text, display_order integer,
  content_version integer, xp_reward integer, dinar_reward integer,
  cover_media_id uuid, scene_count integer,
  created_at timestamptz, updated_at timestamptz, published_at timestamptz
)
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
  RETURN QUERY
  SELECT s.id, s.slug, s.title_ar, s.title_en, s.status,
         s.world_slug, s.era, s.display_order, s.content_version,
         s.xp_reward, s.dinar_reward, s.cover_media_id,
         (SELECT count(*)::integer FROM public.story_scenes c WHERE c.story_id = s.id) AS scene_count,
         s.created_at, s.updated_at, s.published_at
    FROM public.stories s
   ORDER BY s.updated_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_stories() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_stories() TO authenticated;
