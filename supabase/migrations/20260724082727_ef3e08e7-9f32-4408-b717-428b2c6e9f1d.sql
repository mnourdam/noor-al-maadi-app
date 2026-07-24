-- Final M2 corrective pass only. M1 untouched. No content-row deletes.
DO $$
DECLARE
  v_sources_count integer;
  v_relations_count integer;
BEGIN
  SELECT count(*) INTO v_sources_count FROM public.story_sources;
  SELECT count(*) INTO v_relations_count FROM public.story_relations;
  IF v_sources_count <> 0 THEN
    RAISE EXCEPTION 'story_sources_not_empty_safe_enum_replacement_aborted:%', v_sources_count;
  END IF;
  IF v_relations_count <> 0 THEN
    RAISE EXCEPTION 'story_relations_not_empty_exact_shape_rebuild_aborted:%', v_relations_count;
  END IF;
END $$;

ALTER TABLE public.story_sources
  ALTER COLUMN kind TYPE text USING kind::text;

DROP TYPE IF EXISTS public.story_source_kind;
CREATE TYPE public.story_source_kind AS ENUM ('book','manuscript','article','quran','hadith','url','archive','other');

DROP TABLE public.story_sources CASCADE;
DROP TABLE public.story_relations CASCADE;

CREATE TABLE public.story_relations (
  id text PRIMARY KEY,
  story_id text NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  target_type public.story_relation_target_type NOT NULL,
  target_id text NOT NULL,
  target_extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  role public.story_relation_role NOT NULL,
  notes text NULL,
  display_order int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_relations_unique UNIQUE (story_id, target_type, target_id, role)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_relations TO authenticated;
GRANT ALL ON public.story_relations TO service_role;
ALTER TABLE public.story_relations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "story_relations_editor_read" ON public.story_relations FOR SELECT TO authenticated USING (public.is_content_editor());
CREATE POLICY "story_relations_editor_write" ON public.story_relations FOR ALL TO authenticated USING (public.is_content_editor()) WITH CHECK (public.is_content_editor());
CREATE INDEX story_relations_story_idx ON public.story_relations (story_id, role, display_order);
CREATE INDEX story_relations_target_idx ON public.story_relations (target_type, target_id);

CREATE TABLE public.story_sources (
  id text PRIMARY KEY,
  story_id text NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  kind public.story_source_kind NOT NULL,
  citation text NOT NULL,
  title text NULL,
  author text NULL,
  year text NULL,
  page text NULL,
  url text NULL,
  weight int NULL,
  notes text NULL,
  display_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_sources_unique UNIQUE (story_id, source_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_sources TO authenticated;
GRANT ALL ON public.story_sources TO service_role;
ALTER TABLE public.story_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "story_sources_editor_read" ON public.story_sources FOR SELECT TO authenticated USING (public.is_content_editor());
CREATE POLICY "story_sources_editor_write" ON public.story_sources FOR ALL TO authenticated USING (public.is_content_editor()) WITH CHECK (public.is_content_editor());
CREATE INDEX story_sources_story_idx ON public.story_sources (story_id, display_order);
CREATE INDEX story_sources_kind_idx ON public.story_sources (kind, source_key);

CREATE OR REPLACE FUNCTION public.story_relations_enforce_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'story_relations.id is immutable';
  END IF;
  IF NEW.story_id <> OLD.story_id THEN
    RAISE EXCEPTION 'story_relations.story_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER story_relations_immutable_trg BEFORE UPDATE ON public.story_relations FOR EACH ROW EXECUTE FUNCTION public.story_relations_enforce_immutable();

CREATE OR REPLACE FUNCTION public.story_sources_enforce_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'story_sources.id is immutable';
  END IF;
  IF NEW.story_id <> OLD.story_id THEN
    RAISE EXCEPTION 'story_sources.story_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER story_sources_immutable_trg BEFORE UPDATE ON public.story_sources FOR EACH ROW EXECUTE FUNCTION public.story_sources_enforce_immutable();

CREATE OR REPLACE FUNCTION public.story_relations_validate_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ok boolean := false;
  v_chapter_id text;
BEGIN
  IF NEW.target_type = 'artifact' THEN
    RAISE EXCEPTION 'artifact_target_blocked'
      USING HINT = 'Artifact relation target unavailable until canonical artifact source is approved.';
  END IF;

  IF NEW.target_type = 'campaign_chapter' THEN
    v_chapter_id := btrim(COALESCE(NEW.target_extra->>'chapter_id', ''));
    IF v_chapter_id = '' THEN
      RAISE EXCEPTION 'campaign_chapter_target_missing_chapter_id'
        USING HINT = 'Use target_id as the campaign id and target_extra.chapter_id as the stable chapter id.';
    END IF;

    SELECT EXISTS (
      SELECT 1
        FROM public.admin_campaigns c
       WHERE c.id::text = NEW.target_id
         AND EXISTS (
           SELECT 1
             FROM jsonb_array_elements(COALESCE(c.data->'chapters', '[]'::jsonb)) AS chapter(value)
            WHERE chapter.value->>'id' = v_chapter_id
         )
    ) INTO v_ok;
  ELSE
    v_ok := CASE NEW.target_type
      WHEN 'campaign'               THEN EXISTS (SELECT 1 FROM public.admin_campaigns WHERE id::text = NEW.target_id)
      WHEN 'investigation'          THEN EXISTS (SELECT 1 FROM public.investigations WHERE id::text = NEW.target_id)
      WHEN 'encyclopedia_entity'    THEN EXISTS (SELECT 1 FROM public.encyclopedia_entities WHERE id::text = NEW.target_id)
      WHEN 'atlas_entity'           THEN EXISTS (SELECT 1 FROM public.atlas_entities WHERE id::text = NEW.target_id)
      WHEN 'achievement'            THEN EXISTS (SELECT 1 FROM public.achievement_registry WHERE id::text = NEW.target_id)
      WHEN 'story'                  THEN EXISTS (SELECT 1 FROM public.stories WHERE id = NEW.target_id)
      WHEN 'collection'             THEN EXISTS (SELECT 1 FROM public.story_collections WHERE id = NEW.target_id)
      WHEN 'today_in_history_event' THEN EXISTS (SELECT 1 FROM public.today_in_history_events WHERE id::text = NEW.target_id)
      ELSE FALSE
    END;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'story_relation_target_not_found: % %', NEW.target_type, NEW.target_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER story_relations_validate_target_trg BEFORE INSERT OR UPDATE OF target_type, target_id, target_extra ON public.story_relations FOR EACH ROW EXECUTE FUNCTION public.story_relations_validate_target();

CREATE OR REPLACE FUNCTION public.story_media_reference_count(p_media_id uuid)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ((SELECT count(*) FROM public.stories WHERE cover_media_id = p_media_id)
        + (SELECT count(*) FROM public.story_scenes WHERE primary_media_id = p_media_id)
        + (SELECT count(*) FROM public.story_collections WHERE cover_media_id = p_media_id))::integer;
$$;

CREATE OR REPLACE FUNCTION public.admin_attach_story_cover(p_story_id text, p_media_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_media public.story_media;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_media_id IS NULL THEN
    UPDATE public.stories SET cover_media_id = NULL, updated_at = now() WHERE id = p_story_id;
    RETURN jsonb_build_object('ok', true, 'cover_media_id', NULL);
  END IF;
  SELECT * INTO v_media FROM public.story_media WHERE id = p_media_id;
  IF v_media.id IS NULL THEN RAISE EXCEPTION 'media_not_found'; END IF;
  IF NOT v_media.verified THEN RAISE EXCEPTION 'media_not_verified'; END IF;
  IF v_media.owner_scope <> 'story' OR v_media.story_id <> p_story_id THEN RAISE EXCEPTION 'media_not_owned_by_story'; END IF;
  UPDATE public.stories SET cover_media_id = p_media_id, updated_at = now() WHERE id = p_story_id;
  RETURN jsonb_build_object('ok', true, 'cover_media_id', p_media_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_attach_scene_media(p_story_id text, p_scene_id text, p_media_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_media public.story_media;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_media_id IS NULL THEN
    UPDATE public.story_scenes SET primary_media_id = NULL, updated_at = now() WHERE story_id = p_story_id AND id = p_scene_id;
    RETURN jsonb_build_object('ok', true, 'primary_media_id', NULL);
  END IF;
  SELECT * INTO v_media FROM public.story_media WHERE id = p_media_id;
  IF v_media.id IS NULL THEN RAISE EXCEPTION 'media_not_found'; END IF;
  IF NOT v_media.verified THEN RAISE EXCEPTION 'media_not_verified'; END IF;
  IF v_media.owner_scope <> 'story' OR v_media.story_id <> p_story_id THEN RAISE EXCEPTION 'media_not_owned_by_story'; END IF;
  UPDATE public.story_scenes SET primary_media_id = p_media_id, updated_at = now() WHERE story_id = p_story_id AND id = p_scene_id;
  RETURN jsonb_build_object('ok', true, 'primary_media_id', p_media_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_story(p_story_id text, p_mode text DEFAULT 'archive'::text, p_force boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_progress int;
  v_completions int;
  v_paths jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT status INTO v_status FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'story_not_found'); END IF;
  IF p_mode = 'archive' THEN
    UPDATE public.stories SET status = 'archived', updated_at = now() WHERE id = p_story_id;
    RETURN jsonb_build_object('ok', true, 'mode', 'archive');
  END IF;
  IF p_mode <> 'hard' THEN RAISE EXCEPTION 'invalid_mode:%', p_mode; END IF;
  SELECT count(*) INTO v_progress FROM public.user_story_progress WHERE story_id = p_story_id;
  SELECT count(*) INTO v_completions FROM public.user_story_completions WHERE story_id = p_story_id;
  IF (v_progress + v_completions) > 0 AND NOT p_force THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'has_player_data', 'progress', v_progress, 'completions', v_completions);
  END IF;
  UPDATE public.stories SET cover_media_id = NULL WHERE id = p_story_id;
  UPDATE public.story_scenes SET primary_media_id = NULL WHERE story_id = p_story_id;
  WITH deleted AS (
    DELETE FROM public.story_media WHERE story_id = p_story_id AND owner_scope = 'story' RETURNING storage_bucket, storage_path
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('bucket', storage_bucket, 'path', storage_path)), '[]'::jsonb) INTO v_paths FROM deleted;
  DELETE FROM public.stories WHERE id = p_story_id;
  RETURN jsonb_build_object('ok', true, 'mode', 'hard', 'storage', v_paths);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_story_delete_impact(p_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_rows jsonb;
  v_totals jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN jsonb_build_object('items', '[]'::jsonb, 'totals', jsonb_build_object()); END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT s.id, s.slug, s.title_ar, s.status,
      (SELECT count(*)::int FROM public.story_scenes sc WHERE sc.story_id = s.id) AS scenes,
      (SELECT count(*)::int FROM public.story_media m WHERE m.story_id = s.id AND m.owner_scope = 'story') AS owned_media,
      0::int AS shared_media,
      (SELECT count(*)::int FROM public.user_story_progress p WHERE p.story_id = s.id) AS progress_rows,
      (SELECT count(*)::int FROM public.user_story_completions c WHERE c.story_id = s.id) AS completions,
      (SELECT count(*)::int FROM public.social_comments c WHERE c.anchor_type = 'story' AND c.anchor_id::text = s.id) AS comments,
      (SELECT count(*)::int FROM public.social_comments c WHERE c.anchor_type = 'story' AND c.anchor_id::text = s.id AND c.status = 'visible') AS visible_comments,
      (SELECT count(*)::int FROM public.social_comments c WHERE c.anchor_type = 'story' AND c.anchor_id::text = s.id AND c.status = 'hidden') AS hidden_comments,
      (SELECT count(*)::int FROM public.social_comments c WHERE c.anchor_type = 'story' AND c.anchor_id::text = s.id AND c.status = 'removed') AS removed_comments,
      (SELECT count(*)::int FROM public.social_reactions r WHERE r.anchor_type = 'story' AND r.anchor_id::text = s.id) AS reactions
    FROM public.stories s WHERE s.id = ANY(p_ids)
  ) x;
  SELECT jsonb_build_object(
    'stories', COALESCE(jsonb_array_length(v_rows), 0),
    'published', COALESCE(SUM(CASE WHEN (r->>'status') = 'published' THEN 1 ELSE 0 END), 0),
    'draft', COALESCE(SUM(CASE WHEN (r->>'status') = 'draft' THEN 1 ELSE 0 END), 0),
    'archived', COALESCE(SUM(CASE WHEN (r->>'status') = 'archived' THEN 1 ELSE 0 END), 0),
    'scenes', COALESCE(SUM((r->>'scenes')::int), 0),
    'owned_media', COALESCE(SUM((r->>'owned_media')::int), 0),
    'shared_media', COALESCE(SUM((r->>'shared_media')::int), 0),
    'progress', COALESCE(SUM((r->>'progress_rows')::int), 0),
    'completions', COALESCE(SUM((r->>'completions')::int), 0),
    'comments', COALESCE(SUM((r->>'comments')::int), 0),
    'visible_comments', COALESCE(SUM((r->>'visible_comments')::int), 0),
    'hidden_comments', COALESCE(SUM((r->>'hidden_comments')::int), 0),
    'removed_comments', COALESCE(SUM((r->>'removed_comments')::int), 0),
    'reactions', COALESCE(SUM((r->>'reactions')::int), 0)
  ) INTO v_totals FROM jsonb_array_elements(v_rows) r;
  RETURN jsonb_build_object('items', v_rows, 'totals', v_totals);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_export_stories(p_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids text[];
  v_items jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN SELECT array_agg(id) INTO v_ids FROM public.stories; ELSE v_ids := p_ids; END IF;
  IF v_ids IS NULL THEN RETURN jsonb_build_object('version', 1, 'exported_at', now(), 'stories', '[]'::jsonb); END IF;
  SELECT jsonb_agg(item ORDER BY item->>'id') INTO v_items
  FROM (
    SELECT jsonb_build_object(
      'id', s.id, 'slug', s.slug, 'title_ar', s.title_ar, 'title_en', s.title_en,
      'summary_ar', s.summary_ar, 'summary_en', s.summary_en, 'world_slug', s.world_slug,
      'era', s.era, 'display_order', s.display_order, 'status', s.status,
      'content_version', s.content_version, 'unlock_spec', s.unlock_spec,
      'cover_media_id', s.cover_media_id, 'xp_reward', s.xp_reward,
      'dinar_reward', s.dinar_reward, 'metadata', s.metadata,
      'scenes', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', sc.id, 'scene_index', sc.scene_index, 'scene_type', sc.scene_type, 'title_ar', sc.title_ar, 'title_en', sc.title_en, 'payload', sc.payload, 'primary_media_id', sc.primary_media_id) ORDER BY sc.scene_index) FROM public.story_scenes sc WHERE sc.story_id = s.id), '[]'::jsonb),
      'media', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'kind', m.kind, 'storage_bucket', m.storage_bucket, 'storage_path', m.storage_path, 'mime_type', m.mime_type, 'byte_size', m.byte_size, 'width', m.width, 'height', m.height, 'checksum_sha256', m.checksum_sha256, 'preset', m.preset, 'processing_version', m.processing_version, 'owner_scope', m.owner_scope, 'metadata', m.metadata) ORDER BY m.created_at) FROM public.story_media m WHERE m.story_id = s.id OR m.id = s.cover_media_id OR m.id IN (SELECT primary_media_id FROM public.story_scenes WHERE story_id = s.id AND primary_media_id IS NOT NULL)), '[]'::jsonb)
    ) AS item
    FROM public.stories s WHERE s.id = ANY(v_ids)
  ) t;
  RETURN jsonb_build_object('version', 1, 'exported_at', now(), 'stories', COALESCE(v_items, '[]'::jsonb));
END;
$$;

CREATE OR REPLACE FUNCTION public.story_collections_validate_cover_media()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.cover_media_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.story_media m
    WHERE m.id = NEW.cover_media_id
      AND m.owner_scope = 'collection'
      AND m.collection_id = NEW.id
      AND m.story_id IS NULL
      AND m.verified = true
  ) THEN
    RAISE EXCEPTION 'invalid_collection_cover_media'
      USING HINT = 'Collection cover media must be verified and owned by the same collection.';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS story_collections_validate_cover_media_trg ON public.story_collections;
CREATE TRIGGER story_collections_validate_cover_media_trg BEFORE INSERT OR UPDATE OF cover_media_id, id ON public.story_collections FOR EACH ROW EXECUTE FUNCTION public.story_collections_validate_cover_media();