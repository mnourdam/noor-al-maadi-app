CREATE OR REPLACE FUNCTION public.admin_publish_investigation(p_id uuid, p_note text DEFAULT NULL::text, p_allow_removals boolean DEFAULT false, p_version_signal text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_row record;
  v_current text;
  v_draft jsonb;
  v_next_version int;
  v_published jsonb;
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'missing id'; END IF;

  SELECT * INTO v_row FROM public.investigations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'investigation not found'; END IF;

  v_current := COALESCE(to_jsonb(v_row.*)->>'updated_at', to_jsonb(v_row.*)->>'created_at');
  IF p_version_signal IS NOT NULL AND p_version_signal <> v_current THEN
    RAISE EXCEPTION 'stale: content changed since editor loaded' USING ERRCODE = 'P0004';
  END IF;

  IF v_row.draft_data IS NULL THEN
    RAISE EXCEPTION 'no draft to publish';
  END IF;

  v_draft := v_row.draft_data;
  -- Force immutable slug + preserve stable IDs against the current published row.
  v_draft := jsonb_set(v_draft, '{slug}', to_jsonb(v_row.slug), true);
  v_draft := public.admin_merge_investigation_stable_ids(v_draft, to_jsonb(v_row.*));

  PERFORM public.admin_validate_investigation_payload(
            v_draft,
            to_jsonb(v_row.*),
            p_allow_removals);

  v_published := jsonb_build_object(
    'title', v_row.title, 'subtitle', v_row.subtitle,
    'description', v_row.description, 'difficulty', v_row.difficulty,
    'reward', COALESCE(v_row.reward,'{}'::jsonb),
    'steps', COALESCE(v_row.steps,'[]'::jsonb),
    'related_entities', COALESCE(v_row.related_entities,'[]'::jsonb),
    'enabled', v_row.enabled,
    'world_slug', v_row.world_slug
  );

  -- No-op publish: nothing to promote.
  IF v_draft - 'id' - 'slug' - 'created_at' - 'updated_at' - 'enabled'
     = v_published - 'id' - 'slug' - 'created_at' - 'updated_at' - 'enabled'
  THEN
    UPDATE public.investigations
       SET has_unpublished_changes = false
     WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'mode', 'noop',
                              'version', v_row.content_version);
  END IF;

  v_next_version := COALESCE(v_row.content_version, 1) + 1;
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  -- Guide the auto-version trigger's source/note attribution.
  PERFORM set_config('irth.publish_source', 'editor.publish', true);
  PERFORM set_config('irth.publish_note', COALESCE(p_note, ''), true);

  UPDATE public.investigations SET
    title            = COALESCE(v_draft->>'title', title),
    subtitle         = NULLIF(v_draft->>'subtitle',''),
    description      = NULLIF(v_draft->>'description',''),
    difficulty       = COALESCE(v_draft->>'difficulty', difficulty),
    reward           = COALESCE(v_draft->'reward','{}'::jsonb),
    steps            = COALESCE(v_draft->'steps','[]'::jsonb),
    related_entities = COALESCE(v_draft->'related_entities','[]'::jsonb),
    world_slug       = v_draft->>'world_slug',
    draft_data       = NULL,
    content_version  = v_next_version,
    published_at     = now(),
    has_unpublished_changes = false,
    updated_by       = v_uid,
    last_editor_email = v_email,
    updated_at       = now()
  WHERE id = p_id;

  INSERT INTO public.admin_audit_log(actor_id, action, detail)
  VALUES (v_uid, 'investigation.publish',
          jsonb_build_object('investigation_id', p_id, 'version', v_next_version,
                             'note', NULLIF(btrim(COALESCE(p_note,'')),'')));

  RETURN jsonb_build_object(
    'ok', true,
    'mode', 'publish',
    'version', v_next_version,
    'published_at', now()
  );
END $function$;