
-- =====================================================================
-- PART A: ROLLBACK drifted M2 objects (leave M1 fully intact)
-- =====================================================================

-- Detach FK on stories.story_collection_id (M1 column stays; only FK is M2)
ALTER TABLE public.stories
  DROP CONSTRAINT IF EXISTS stories_story_collection_id_fkey;

-- Revert story_media additions
DROP INDEX IF EXISTS public.story_media_collection_idx;
ALTER TABLE public.story_media
  DROP CONSTRAINT IF EXISTS story_media_ownership_check;
ALTER TABLE public.story_media
  ADD CONSTRAINT story_media_ownership_check
  CHECK (ownership = ANY (ARRAY['story-owned'::text, 'shared'::text]));
ALTER TABLE public.story_media
  DROP COLUMN IF EXISTS collection_id;

-- Drop drifted M2 tables + triggers/functions
DROP TABLE IF EXISTS public.story_sources CASCADE;
DROP TABLE IF EXISTS public.story_relations CASCADE;
DROP TABLE IF EXISTS public.story_collections CASCADE;
DROP FUNCTION IF EXISTS public.story_sources_enforce_immutable() CASCADE;
DROP FUNCTION IF EXISTS public.story_relations_enforce_immutable() CASCADE;
DROP FUNCTION IF EXISTS public.story_collections_enforce_immutable() CASCADE;

-- Drop drifted enums (invented / unused after rollback)
DROP TYPE IF EXISTS public.story_source_reliability;
DROP TYPE IF EXISTS public.story_source_type;
DROP TYPE IF EXISTS public.story_relation_type;

-- =====================================================================
-- PART B: REBUILD M2 per frozen Stories v2 Core Contract
-- Strictly additive. No new enums. No renames.
-- =====================================================================

-- ------------------------------------------------------------------
-- story_collections (no production_status; no visibility gating here)
-- ------------------------------------------------------------------
CREATE TABLE public.story_collections (
  id                text PRIMARY KEY,
  slug              text NOT NULL UNIQUE,
  title_ar          text NOT NULL,
  title_en          text,
  summary_ar        text,
  summary_en        text,
  world_slug        text,
  cover_media_id    uuid REFERENCES public.story_media(id) ON DELETE SET NULL,
  display_order     integer NOT NULL DEFAULT 0,
  schema_version    smallint NOT NULL DEFAULT 2,
  tags              text[] NOT NULL DEFAULT '{}',
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_collections TO authenticated;
GRANT ALL ON public.story_collections TO service_role;

ALTER TABLE public.story_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_collections_editor_read"
  ON public.story_collections FOR SELECT
  TO authenticated
  USING (public.is_content_editor());

CREATE POLICY "story_collections_editor_write"
  ON public.story_collections FOR ALL
  TO authenticated
  USING (public.is_content_editor())
  WITH CHECK (public.is_content_editor());

CREATE INDEX story_collections_display_order_idx
  ON public.story_collections (display_order);
CREATE INDEX story_collections_world_idx
  ON public.story_collections (world_slug);
CREATE INDEX story_collections_tags_gin_idx
  ON public.story_collections USING GIN (tags);

CREATE OR REPLACE FUNCTION public.story_collections_enforce_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'story_collections.id is immutable';
  END IF;
  IF NEW.slug <> OLD.slug THEN
    RAISE EXCEPTION 'story_collections.slug is immutable';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER story_collections_immutable_trg
  BEFORE UPDATE ON public.story_collections
  FOR EACH ROW EXECUTE FUNCTION public.story_collections_enforce_immutable();

-- ------------------------------------------------------------------
-- story_relations (generic relation model)
-- ------------------------------------------------------------------
CREATE TABLE public.story_relations (
  id             text PRIMARY KEY,
  story_id       text NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  target_type    text NOT NULL,
  target_id      text NOT NULL,
  target_extra   jsonb NOT NULL DEFAULT '{}'::jsonb,
  role           text NOT NULL,
  display_order  integer NOT NULL DEFAULT 0,
  schema_version smallint NOT NULL DEFAULT 2,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_relations_unique
    UNIQUE (story_id, target_type, target_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_relations TO authenticated;
GRANT ALL ON public.story_relations TO service_role;

ALTER TABLE public.story_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_relations_editor_read"
  ON public.story_relations FOR SELECT
  TO authenticated
  USING (public.is_content_editor());

CREATE POLICY "story_relations_editor_write"
  ON public.story_relations FOR ALL
  TO authenticated
  USING (public.is_content_editor())
  WITH CHECK (public.is_content_editor());

CREATE INDEX story_relations_story_idx
  ON public.story_relations (story_id, role, display_order);
CREATE INDEX story_relations_target_idx
  ON public.story_relations (target_type, target_id);

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
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER story_relations_immutable_trg
  BEFORE UPDATE ON public.story_relations
  FOR EACH ROW EXECUTE FUNCTION public.story_relations_enforce_immutable();

-- ------------------------------------------------------------------
-- story_sources (frozen kind/source_key/citation schema)
-- ------------------------------------------------------------------
CREATE TABLE public.story_sources (
  id                text PRIMARY KEY,
  story_id          text NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  kind              text NOT NULL,
  source_key        text NOT NULL,
  citation          text NOT NULL,
  reference_locator text,
  url               text,
  display_order     integer NOT NULL DEFAULT 0,
  schema_version    smallint NOT NULL DEFAULT 2,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_sources_unique UNIQUE (story_id, kind, source_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.story_sources TO authenticated;
GRANT ALL ON public.story_sources TO service_role;

ALTER TABLE public.story_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_sources_editor_read"
  ON public.story_sources FOR SELECT
  TO authenticated
  USING (public.is_content_editor());

CREATE POLICY "story_sources_editor_write"
  ON public.story_sources FOR ALL
  TO authenticated
  USING (public.is_content_editor())
  WITH CHECK (public.is_content_editor());

CREATE INDEX story_sources_story_idx
  ON public.story_sources (story_id, display_order);
CREATE INDEX story_sources_kind_idx
  ON public.story_sources (kind, source_key);

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
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER story_sources_immutable_trg
  BEFORE UPDATE ON public.story_sources
  FOR EACH ROW EXECUTE FUNCTION public.story_sources_enforce_immutable();

-- ------------------------------------------------------------------
-- story_media — additive collection ownership
-- ------------------------------------------------------------------
ALTER TABLE public.story_media
  ADD COLUMN collection_id text
    REFERENCES public.story_collections(id) ON DELETE SET NULL;

ALTER TABLE public.story_media
  DROP CONSTRAINT story_media_ownership_check;
ALTER TABLE public.story_media
  ADD CONSTRAINT story_media_ownership_check
  CHECK (ownership = ANY (ARRAY['story-owned'::text, 'shared'::text, 'collection-owned'::text]));

CREATE INDEX story_media_collection_idx
  ON public.story_media (collection_id, kind);

-- ------------------------------------------------------------------
-- stories.story_collection_id — attach FK to new story_collections
-- ------------------------------------------------------------------
ALTER TABLE public.stories
  ADD CONSTRAINT stories_story_collection_id_fkey
  FOREIGN KEY (story_collection_id)
  REFERENCES public.story_collections(id)
  ON DELETE SET NULL;
