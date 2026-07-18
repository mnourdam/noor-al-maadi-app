
-- =========================================================================
-- Phase D: Investigation lifecycle (draft / publish / versions / rollback)
-- =========================================================================

-- 1) Lifecycle columns on investigations ---------------------------------
ALTER TABLE public.investigations
  ADD COLUMN IF NOT EXISTS draft_data              jsonb,
  ADD COLUMN IF NOT EXISTS content_version         int         NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS published_at            timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by              uuid,
  ADD COLUMN IF NOT EXISTS last_editor_email       text,
  ADD COLUMN IF NOT EXISTS last_draft_saved_at     timestamptz,
  ADD COLUMN IF NOT EXISTS has_unpublished_changes boolean     NOT NULL DEFAULT false;

-- Backfill: current row content is already the (only) published version.
UPDATE public.investigations
   SET published_at = COALESCE(published_at, updated_at),
       content_version = GREATEST(COALESCE(content_version, 1), 1),
       has_unpublished_changes = false
 WHERE published_at IS NULL OR content_version IS NULL;

-- 2) Column-level access hardening ---------------------------------------
-- Player readers must never see draft_data or editor identity.
REVOKE ALL ON public.investigations FROM anon, authenticated;

-- Player-safe columns only (matches the current row shape used by the app).
GRANT SELECT
  (id, slug, title, subtitle, description, difficulty, reward, steps,
   related_entities, enabled, content_version, published_at,
   created_at, updated_at)
  ON public.investigations TO anon, authenticated;

-- Editors keep write access; policies still gate rows.
GRANT INSERT, UPDATE, DELETE ON public.investigations TO authenticated;
GRANT ALL ON public.investigations TO service_role;

-- 3) Player-safe view -----------------------------------------------------
-- security_invoker = true so the caller's RLS + column grants still apply.
CREATE OR REPLACE VIEW public.investigations_public
WITH (security_invoker = true) AS
  SELECT
    id, slug, title, subtitle, description, difficulty,
    reward, steps, related_entities, enabled,
    content_version, published_at, created_at, updated_at
    FROM public.investigations
   WHERE enabled = true;

GRANT SELECT ON public.investigations_public TO anon, authenticated;

COMMENT ON VIEW public.investigations_public IS
  'Player-safe published snapshot of investigations. Draft data and editor identity are never exposed.';

-- 4) Append-only version history -----------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_investigation_versions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id  uuid NOT NULL REFERENCES public.investigations(id) ON DELETE CASCADE,
  version           int  NOT NULL,
  title             text,
  slug              text,
  data              jsonb NOT NULL,
  source            text NOT NULL DEFAULT 'editor.publish',
  editor_id         uuid,
  editor_email      text,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (investigation_id, version)
);

GRANT SELECT, INSERT ON public.admin_investigation_versions TO authenticated;
GRANT ALL ON public.admin_investigation_versions TO service_role;

ALTER TABLE public.admin_investigation_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read investigation versions"   ON public.admin_investigation_versions;
DROP POLICY IF EXISTS "admins insert investigation versions" ON public.admin_investigation_versions;

CREATE POLICY "admins read investigation versions"
  ON public.admin_investigation_versions FOR SELECT
  TO authenticated
  USING (public.is_content_admin());

CREATE POLICY "admins insert investigation versions"
  ON public.admin_investigation_versions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_content_admin());

CREATE INDEX IF NOT EXISTS admin_investigation_versions_inv_idx
  ON public.admin_investigation_versions(investigation_id, version DESC);

-- Backfill: every existing investigation becomes version 1.
INSERT INTO public.admin_investigation_versions
  (investigation_id, version, title, slug, data, source, note, created_at)
SELECT
  i.id, 1, i.title, i.slug,
  jsonb_build_object(
    'id', i.id, 'slug', i.slug, 'title', i.title,
    'subtitle', i.subtitle, 'description', i.description,
    'difficulty', i.difficulty, 'reward', COALESCE(i.reward, '{}'::jsonb),
    'steps', COALESCE(i.steps, '[]'::jsonb),
    'related_entities', COALESCE(i.related_entities, '[]'::jsonb),
    'enabled', i.enabled
  ),
  'backfill.phase_d', 'Backfilled version 1 during Phase D lifecycle migration',
  COALESCE(i.published_at, i.updated_at)
  FROM public.investigations i
 WHERE NOT EXISTS (
   SELECT 1 FROM public.admin_investigation_versions v
    WHERE v.investigation_id = i.id
 );

-- 5) Auto-version trigger -------------------------------------------------
-- Fires when publish-visible columns change; snapshots into version history
-- and bumps content_version. Draft-only writes (only draft_data changed)
-- do NOT fire, so player content stays fixed until an explicit publish.
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
      NEW.slug             IS DISTINCT FROM OLD.slug
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
      'enabled', NEW.enabled
    ),
    COALESCE(current_setting('irth.publish_source', true), 'publish'),
    v_uid,
    v_email,
    NULLIF(current_setting('irth.publish_note', true), '')
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS investigations_autoversion_trg ON public.investigations;
CREATE TRIGGER investigations_autoversion_trg
  AFTER INSERT OR UPDATE ON public.investigations
  FOR EACH ROW EXECUTE FUNCTION public.investigations_autoversion();

-- 6) Draft save (does NOT change player-visible content) -----------------
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

  -- Full validation — draft must always be valid before we accept it.
  PERFORM public.admin_validate_investigation_payload(
            v_data,
            to_jsonb(v_row.*),
            p_allow_removals);

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  UPDATE public.investigations
     SET draft_data              = v_data,
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

REVOKE ALL ON FUNCTION public.admin_save_investigation_draft(uuid, jsonb, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_investigation_draft(uuid, jsonb, text, boolean) TO authenticated;

-- 7) Publish (promote draft → published, atomic) -------------------------
CREATE OR REPLACE FUNCTION public.admin_publish_investigation(
  p_id             uuid,
  p_note           text    DEFAULT NULL,
  p_allow_removals boolean DEFAULT false,
  p_version_signal text    DEFAULT NULL
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
    'enabled', v_row.enabled
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
END $$;

REVOKE ALL ON FUNCTION public.admin_publish_investigation(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_publish_investigation(uuid, text, boolean, text) TO authenticated;

-- 8) List versions --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_investigation_versions(p_id uuid)
RETURNS TABLE (
  version      int,
  title        text,
  source       text,
  editor_email text,
  note         text,
  created_at   timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT v.version, v.title, v.source, v.editor_email, v.note, v.created_at
      FROM public.admin_investigation_versions v
     WHERE v.investigation_id = p_id
     ORDER BY v.version DESC
     LIMIT 200;
END $$;

REVOKE ALL ON FUNCTION public.admin_list_investigation_versions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_investigation_versions(uuid) TO authenticated;

-- 9) Get a specific version -----------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_investigation_version(
  p_id uuid, p_version int
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_data jsonb;
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT data INTO v_data
    FROM public.admin_investigation_versions
   WHERE investigation_id = p_id AND version = p_version;
  RETURN v_data;
END $$;

REVOKE ALL ON FUNCTION public.admin_get_investigation_version(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_investigation_version(uuid, int) TO authenticated;

-- 10) Restore a version into the DRAFT (safe path) -----------------------
CREATE OR REPLACE FUNCTION public.admin_restore_investigation_version_to_draft(
  p_id uuid, p_version int
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_data jsonb;
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;
  SELECT data INTO v_data
    FROM public.admin_investigation_versions
   WHERE investigation_id = p_id AND version = p_version;
  IF v_data IS NULL THEN RAISE EXCEPTION 'version_not_found'; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;

  UPDATE public.investigations
     SET draft_data              = v_data,
         has_unpublished_changes = true,
         updated_by              = v_uid,
         last_editor_email       = v_email,
         last_draft_saved_at     = now()
   WHERE id = p_id;

  INSERT INTO public.admin_audit_log(actor_id, action, detail)
  VALUES (v_uid, 'investigation.rollback_to_draft',
          jsonb_build_object('investigation_id', p_id, 'restored_from', p_version));

  RETURN jsonb_build_object('ok', true, 'mode', 'draft', 'restored_from', p_version);
END $$;

REVOKE ALL ON FUNCTION public.admin_restore_investigation_version_to_draft(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_investigation_version_to_draft(uuid, int) TO authenticated;

-- 11) Extend admin_get_investigation_full to expose lifecycle + draft ----
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
    -- lifecycle metadata
    'draft_data',              v_row.draft_data,
    'content_version',         v_row.content_version,
    'published_at',            v_row.published_at,
    'has_unpublished_changes', v_row.has_unpublished_changes,
    'last_editor_email',       v_row.last_editor_email,
    'last_draft_saved_at',     v_row.last_draft_saved_at
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_get_investigation_full(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_investigation_full(TEXT) TO authenticated;
