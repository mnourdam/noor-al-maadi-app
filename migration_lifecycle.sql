-- Update save draft to include world_slug
CREATE OR REPLACE FUNCTION public.admin_save_investigation_draft(
  p_id              uuid,
  p_draft           jsonb,
  p_version_signal  text DEFAULT NULL,
  p_allow_removals  boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_row record;
  v_current text;
  v_data jsonb := p_draft;
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'missing id'; END IF;
  IF p_draft IS NULL THEN RAISE EXCEPTION 'missing draft'; END IF;

  SELECT * INTO v_row FROM public.investigations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'investigation not found'; END IF;

  v_current := COALESCE(to_jsonb(v_row.*)->>'updated_at', to_jsonb(v_row.*)->>'created_at');
  IF p_version_signal IS NOT NULL AND p_version_signal <> v_current THEN
    RAISE EXCEPTION 'stale: content changed since editor loaded' USING ERRCODE = 'P0004';
  END IF;

  -- Force immutable slug: slug rename is out of scope for Phase D.
  v_data := jsonb_set(v_data, '{slug}', to_jsonb(v_row.slug), true);
  v_data := public.admin_merge_investigation_stable_ids(
              v_data,
              COALESCE(v_row.draft_data, to_jsonb(v_row.*))
            );

  -- Full validation
  PERFORM public.admin_validate_investigation_payload(
            v_data,
            to_jsonb(v_row.*),
            p_allow_removals);

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  UPDATE public.investigations
     SET draft_data              = v_data,
         world_slug              = v_data->>'world_slug', -- Persist world_slug during draft save too
         has_unpublished_changes = true,
         updated_by              = v_uid,
         last_editor_email       = v_email,
         last_draft_saved_at     = now()
   WHERE id = p_id;

  RETURN jsonb_build_object(
    'ok', true,
    'mode', 'draft',
    'has_unpublished_changes', true,
    'last_draft_saved_at', now()
  );
END $$;

-- Update admin_get_investigation_full to expose world_slug
CREATE OR REPLACE FUNCTION public.admin_get_investigation_full(p_id_or_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uuid UUID;
  v_row public.investigations%ROWTYPE;
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_id_or_slug IS NULL OR length(btrim(p_id_or_slug)) = 0 THEN
    RAISE EXCEPTION 'p_id_or_slug is required';
  END IF;

  BEGIN v_uuid := p_id_or_slug::uuid;
  EXCEPTION WHEN OTHERS THEN v_uuid := NULL;
  END;

  IF v_uuid IS NOT NULL THEN
    SELECT * INTO v_row FROM public.investigations WHERE id = v_uuid;
  ELSE
    SELECT * INTO v_row FROM public.investigations WHERE slug = p_id_or_slug;
  END IF;

  IF NOT FOUND THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'id',                v_row.id,
    'slug',              v_row.slug,
    'title',             v_row.title,
    'subtitle',          v_row.subtitle,
    'description',       v_row.description,
    'difficulty',        v_row.difficulty,
    'reward',            COALESCE(v_row.reward, '{}'::jsonb),
    'steps',             COALESCE(v_row.steps, '[]'::jsonb),
    'related_entities',  COALESCE(v_row.related_entities, '[]'::jsonb),
    'enabled',           v_row.enabled,
    'created_at',        v_row.created_at,
    'updated_at',        v_row.updated_at,
    'world_slug',        v_row.world_slug,
    -- lifecycle metadata
    'draft_data',              v_row.draft_data,
    'content_version',         v_row.content_version,
    'published_at',            v_row.published_at,
    'has_unpublished_changes', v_row.has_unpublished_changes,
    'last_editor_email',       v_row.last_editor_email,
    'last_draft_saved_at',     v_row.last_draft_saved_at
  );
END $$;
