-- Update the trigger function to include world_slug
CREATE OR REPLACE FUNCTION public.investigations_autoversion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_changed boolean := false;
  v_uid uuid := auth.uid();
  v_email text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_changed := true;
  ELSE
    v_changed := (
      NEW.title            IS DISTINCT FROM OLD.title           OR
      NEW.subtitle         IS DISTINCT FROM OLD.subtitle        OR
      NEW.description      IS DISTINCT FROM OLD.description     OR
      NEW.difficulty       IS DISTINCT FROM OLD.difficulty      OR
      NEW.reward           IS DISTINCT FROM OLD.reward          OR
      NEW.steps            IS DISTINCT FROM OLD.steps           OR
      NEW.related_entities IS DISTINCT FROM OLD.related_entities OR
      NEW.slug             IS DISTINCT FROM OLD.slug            OR
      NEW.world_slug       IS DISTINCT FROM OLD.world_slug
    );
  END IF;

  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  INSERT INTO public.admin_investigation_versions
    (investigation_id, version, title, slug, data, source, editor_id, editor_email, note)
  VALUES (
    NEW.id,
    NEW.content_version,
    NEW.title,
    NEW.slug,
    jsonb_build_object(
      'id', NEW.id, 'slug', NEW.slug, 'title', NEW.title,
      'subtitle', NEW.subtitle, 'description', NEW.description,
      'difficulty', NEW.difficulty, 'reward', COALESCE(NEW.reward, '{}'::jsonb),
      'steps', COALESCE(NEW.steps, '[]'::jsonb),
      'related_entities', COALESCE(NEW.related_entities, '[]'::jsonb),
      'enabled', NEW.enabled,
      'world_slug', NEW.world_slug
    ),
    COALESCE(current_setting('irth.publish_source', true), 'publish'),
    v_uid,
    v_email,
    NULLIF(current_setting('irth.publish_note', true), '')
  );

  RETURN NEW;
END $$;

-- Update retrieval to expose world_slug
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
    'world_slug',        v_row.world_slug,
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
    -- lifecycle metadata
    'draft_data',              v_row.draft_data,
    'content_version',         v_row.content_version,
    'published_at',            v_row.published_at,
    'has_unpublished_changes', v_row.has_unpublished_changes,
    'last_editor_email',       v_row.last_editor_email,
    'last_draft_saved_at',     v_row.last_draft_saved_at
  );
END $$;

-- Grant column access for RPCs
GRANT SELECT (world_slug) ON public.investigations TO authenticated;
GRANT SELECT (world_slug) ON public.investigations TO anon;

-- Update the public view
CREATE OR REPLACE VIEW public.investigations_public
WITH (security_invoker = true) AS
  SELECT
    id, slug, title, subtitle, description, difficulty,
    reward, steps, related_entities, enabled,
    content_version, published_at, created_at, updated_at,
    world_slug
    FROM public.investigations;

GRANT SELECT ON public.investigations_public TO anon, authenticated;
