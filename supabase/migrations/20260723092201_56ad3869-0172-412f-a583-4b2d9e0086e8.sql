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
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
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

REVOKE ALL ON FUNCTION public.admin_delete_story_media(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_story_media(uuid) TO authenticated;

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
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
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