-- HISTORICAL RECORD — NOT DEPLOYABLE, DO NOT EXECUTE.
-- Production migration version: 20260723052041
-- md5(statement) = f159233f1f01cc15482935f62e6d5968  length = 12497
-- Copied verbatim from supabase_migrations.schema_migrations on 2026-09-05.

-- ---------------------------------------------------------------------
-- Storage RLS for the private `story-media` bucket.
-- Objects are readable by anon (signed-URL flow); writes are admin-only.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "story_media_public_read"   ON storage.objects;
DROP POLICY IF EXISTS "story_media_admin_insert"  ON storage.objects;
DROP POLICY IF EXISTS "story_media_admin_update"  ON storage.objects;
DROP POLICY IF EXISTS "story_media_admin_delete"  ON storage.objects;

CREATE POLICY "story_media_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'story-media');

CREATE POLICY "story_media_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'story-media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "story_media_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'story-media' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'story-media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "story_media_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'story-media' AND public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------
-- Register a media row (admin). Returns the new id. `verified` stays
-- false until an authorised server path (see verify_story_media server fn)
-- re-downloads the stored object and confirms the SHA-256 matches.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_register_story_media(
  p_story_id            text,
  p_kind                text,
  p_storage_bucket      text,
  p_storage_path        text,
  p_mime_type           text,
  p_byte_size           integer,
  p_width               integer,
  p_height              integer,
  p_checksum_sha256     text,
  p_preset              text,
  p_processing_version  integer,
  p_metadata            jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_kind NOT IN ('cover','scene','document','thumbnail') THEN
    RAISE EXCEPTION 'invalid_kind:%', p_kind;
  END IF;
  IF p_storage_bucket <> 'story-media' THEN
    RAISE EXCEPTION 'invalid_bucket:%', p_storage_bucket;
  END IF;
  IF p_checksum_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_checksum';
  END IF;
  IF p_byte_size <= 0 OR p_width <= 0 OR p_height <= 0 THEN
    RAISE EXCEPTION 'invalid_dimensions';
  END IF;
  IF p_preset IS NULL OR length(p_preset) = 0 THEN
    RAISE EXCEPTION 'invalid_preset';
  END IF;

  -- If a row with the exact same content already exists, reuse it (idempotency).
  SELECT id INTO v_id
    FROM public.story_media
   WHERE checksum_sha256 = p_checksum_sha256
     AND preset = p_preset
     AND processing_version = p_processing_version
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    -- Point the existing row at the (possibly newer) story_id if it was unbound.
    UPDATE public.story_media
       SET story_id = COALESCE(story_id, p_story_id),
           metadata = coalesce(p_metadata, '{}'::jsonb) || metadata
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO public.story_media (
    story_id, kind, storage_bucket, storage_path, mime_type,
    byte_size, width, height, checksum_sha256, preset,
    processing_version, metadata
  ) VALUES (
    p_story_id, p_kind, p_storage_bucket, p_storage_path, p_mime_type,
    p_byte_size, p_width, p_height, p_checksum_sha256, p_preset,
    p_processing_version, COALESCE(p_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_register_story_media(text,text,text,text,text,integer,integer,integer,text,text,integer,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_register_story_media(text,text,text,text,text,integer,integer,integer,text,text,integer,jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- Mark a media row verified. Only callable after the server-side
-- verification path has re-downloaded the object and confirmed the
-- SHA-256 matches what was registered. `p_observed_checksum` is the
-- fresh hash; RPC refuses to mark verified unless it equals the
-- declared checksum.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_mark_story_media_verified(
  p_media_id           uuid,
  p_observed_checksum  text,
  p_observed_bytes     integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_expected  text;
  v_bytes     integer;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_observed_checksum !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_checksum';
  END IF;

  SELECT checksum_sha256, byte_size INTO v_expected, v_bytes
    FROM public.story_media WHERE id = p_media_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_expected <> p_observed_checksum THEN
    RAISE EXCEPTION 'checksum_mismatch';
  END IF;
  IF v_bytes <> p_observed_bytes THEN
    RAISE EXCEPTION 'size_mismatch';
  END IF;

  UPDATE public.story_media
     SET verified = true,
         verified_at = now(),
         verified_by = v_uid
   WHERE id = p_media_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_story_media_verified(uuid,text,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_mark_story_media_verified(uuid,text,integer) TO authenticated;

-- ---------------------------------------------------------------------
-- Delete a media row and return the storage location so the caller can
-- remove the underlying object. Refuses to delete media currently
-- referenced as a story cover or a scene's primary media.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_story_media(p_media_id uuid)
RETURNS TABLE(storage_bucket text, storage_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_referenced boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.stories       WHERE cover_media_id   = p_media_id
    UNION ALL
    SELECT 1 FROM public.story_scenes  WHERE primary_media_id = p_media_id
  ) INTO v_referenced;
  IF v_referenced THEN
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

-- ---------------------------------------------------------------------
-- Enumerate orphans: media rows older than `p_min_age_minutes` that
-- are not referenced as a story cover, not referenced as a scene's
-- primary media, and not the target of a published story.
-- ---------------------------------------------------------------------
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
         m.kind, m.preset, m.verified,
         EXTRACT(EPOCH FROM (now() - m.created_at))::integer / 60 AS age_minutes
    FROM public.story_media m
   WHERE m.created_at < now() - make_interval(mins => GREATEST(p_min_age_minutes, 0))
     AND NOT EXISTS (SELECT 1 FROM public.stories      s WHERE s.cover_media_id   = m.id)
     AND NOT EXISTS (SELECT 1 FROM public.story_scenes c WHERE c.primary_media_id = m.id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_story_media_orphans(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_story_media_orphans(integer) TO authenticated;

-- ---------------------------------------------------------------------
-- Publish validation. Returns { ok, issues[] } where each issue is
-- { code, scene_index?, media_id?, message }. Never mutates state.
-- Rules enforced:
--   * story must exist
--   * cover_media_id set and verified
--   * every scene with type in ('reading','perspective','document','reveal')
--     that declares a primary_media_id must reference a verified row
--   * every 'document' scene MUST have primary_media_id set
--   * every media row referenced by story or its scenes must belong to
--     the same story_id (or be story-agnostic)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_validate_story_publish(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_story  public.stories;
  v_issues jsonb := '[]'::jsonb;
  r        record;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_story FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code','story_not_found','message','Story does not exist.')));
  END IF;

  IF v_story.cover_media_id IS NULL THEN
    v_issues := v_issues || jsonb_build_object(
      'code','missing_cover','message','Story has no cover image.');
  ELSE
    PERFORM 1 FROM public.story_media
      WHERE id = v_story.cover_media_id AND verified = true;
    IF NOT FOUND THEN
      v_issues := v_issues || jsonb_build_object(
        'code','cover_unverified',
        'media_id', v_story.cover_media_id,
        'message','Cover media is not verified.');
    END IF;
  END IF;

  FOR r IN
    SELECT scene_index, scene_type, primary_media_id
      FROM public.story_scenes
     WHERE story_id = p_story_id
     ORDER BY scene_index
  LOOP
    IF r.scene_type = 'document' AND r.primary_media_id IS NULL THEN
      v_issues := v_issues || jsonb_build_object(
        'code','document_missing_media',
        'scene_index', r.scene_index,
        'message','Document scene has no primary media.');
    END IF;
    IF r.primary_media_id IS NOT NULL THEN
      PERFORM 1 FROM public.story_media
        WHERE id = r.primary_media_id AND verified = true;
      IF NOT FOUND THEN
        v_issues := v_issues || jsonb_build_object(
          'code','scene_media_unverified',
          'scene_index', r.scene_index,
          'media_id', r.primary_media_id,
          'message','Scene media is not verified.');
      END IF;
    END IF;
  END LOOP;

  -- Cross-story usage: media rows referenced here must be story-agnostic
  -- or belong to this same story.
  FOR r IN
    SELECT m.id, m.story_id
      FROM public.story_media m
     WHERE m.id = v_story.cover_media_id
        OR m.id IN (SELECT primary_media_id FROM public.story_scenes
                     WHERE story_id = p_story_id AND primary_media_id IS NOT NULL)
  LOOP
    IF r.story_id IS NOT NULL AND r.story_id <> p_story_id THEN
      v_issues := v_issues || jsonb_build_object(
        'code','media_cross_story',
        'media_id', r.id,
        'message','Media row belongs to a different story.');
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', jsonb_array_length(v_issues) = 0,
    'issues', v_issues
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_validate_story_publish(text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_validate_story_publish(text) TO authenticated;
