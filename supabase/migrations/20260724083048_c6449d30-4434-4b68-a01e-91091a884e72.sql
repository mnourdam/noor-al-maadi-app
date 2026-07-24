-- M2 Repair follow-up: preserve the frozen owner_scope labels while restoring
-- the existing media pipeline's required unbound-story upload state.

ALTER TABLE public.story_media
  DROP CONSTRAINT IF EXISTS story_media_owner_scope_pairing_check;

ALTER TABLE public.story_media
  ADD CONSTRAINT story_media_owner_scope_pairing_check
  CHECK (
    (
      owner_scope = 'story'
      AND collection_id IS NULL
    )
    OR
    (
      owner_scope = 'collection'
      AND story_id IS NULL
      AND collection_id IS NOT NULL
    )
  );

COMMENT ON CONSTRAINT story_media_owner_scope_pairing_check ON public.story_media IS
  'Story media may be unbound during upload/orphan cleanup; collection media must be bound to exactly one collection.';

CREATE OR REPLACE FUNCTION public.admin_list_story_media_orphans(p_min_age_minutes integer DEFAULT 60)
RETURNS TABLE(
  id uuid,
  storage_bucket text,
  storage_path text,
  byte_size integer,
  kind text,
  preset text,
  verified boolean,
  owner_scope text,
  age_minutes integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id,
    m.storage_bucket,
    m.storage_path,
    m.byte_size,
    m.kind,
    m.preset,
    m.verified,
    m.owner_scope,
    (EXTRACT(EPOCH FROM (now() - m.created_at))::integer / 60) AS age_minutes
  FROM public.story_media m
  WHERE m.owner_scope = 'story'
    AND m.created_at < now() - make_interval(mins => GREATEST(p_min_age_minutes, 0))
    AND public.story_media_reference_count(m.id) = 0;
END;
$$;