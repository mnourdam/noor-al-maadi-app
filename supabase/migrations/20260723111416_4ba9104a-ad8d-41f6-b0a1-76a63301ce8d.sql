
-- Phase A: Story media attach RPCs + backfill orphaned cover.

CREATE OR REPLACE FUNCTION public.admin_attach_story_cover(
  p_story_id text,
  p_media_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_media public.story_media;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_media_id IS NULL THEN
    UPDATE public.stories SET cover_media_id = NULL, updated_at = now()
     WHERE id = p_story_id;
    RETURN jsonb_build_object('ok', true, 'cover_media_id', NULL);
  END IF;

  SELECT * INTO v_media FROM public.story_media WHERE id = p_media_id;
  IF v_media.id IS NULL THEN
    RAISE EXCEPTION 'media_not_found';
  END IF;
  IF NOT v_media.verified THEN
    RAISE EXCEPTION 'media_not_verified';
  END IF;
  IF v_media.ownership = 'story-owned'
     AND v_media.story_id IS NOT NULL
     AND v_media.story_id <> p_story_id THEN
    RAISE EXCEPTION 'media_belongs_to_other_story';
  END IF;

  UPDATE public.stories
     SET cover_media_id = p_media_id,
         updated_at = now()
   WHERE id = p_story_id;

  RETURN jsonb_build_object('ok', true, 'cover_media_id', p_media_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_attach_scene_media(
  p_story_id text,
  p_scene_id text,
  p_media_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_media public.story_media;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_media_id IS NULL THEN
    UPDATE public.story_scenes
       SET primary_media_id = NULL, updated_at = now()
     WHERE story_id = p_story_id AND id = p_scene_id;
    RETURN jsonb_build_object('ok', true, 'primary_media_id', NULL);
  END IF;

  SELECT * INTO v_media FROM public.story_media WHERE id = p_media_id;
  IF v_media.id IS NULL THEN
    RAISE EXCEPTION 'media_not_found';
  END IF;
  IF NOT v_media.verified THEN
    RAISE EXCEPTION 'media_not_verified';
  END IF;
  IF v_media.ownership = 'story-owned'
     AND v_media.story_id IS NOT NULL
     AND v_media.story_id <> p_story_id THEN
    RAISE EXCEPTION 'media_belongs_to_other_story';
  END IF;

  UPDATE public.story_scenes
     SET primary_media_id = p_media_id, updated_at = now()
   WHERE story_id = p_story_id AND id = p_scene_id;

  RETURN jsonb_build_object('ok', true, 'primary_media_id', p_media_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_attach_story_cover(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_attach_scene_media(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_attach_story_cover(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_attach_scene_media(text, text, uuid) TO authenticated;

-- Backfill: the test story wfaa-alnby-raq7 has a verified cover in
-- story_media (uploaded before the immediate-attach RPC existed) but
-- stories.cover_media_id was never persisted. Attach it now.
UPDATE public.stories s
   SET cover_media_id = m.id,
       updated_at = now()
  FROM public.story_media m
 WHERE s.id = 'wfaa-alnby-raq7'
   AND s.cover_media_id IS NULL
   AND m.id = 'f6e9f74d-4923-4464-be4e-174e5ab111e8'
   AND m.verified = true;
