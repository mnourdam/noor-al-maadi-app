
-- M2: Stories v2 Core — Additive Structural Migration
-- Scope: story_collections, story_relations, story_sources, story_media collection ownership additions

-- =====================================================================
-- 1. ENUMS (new only)
-- =====================================================================
CREATE TYPE public.story_relation_type AS ENUM (
  'prequel', 'sequel', 'related', 'contradicts', 'clarifies', 'part_of'
);

CREATE TYPE public.story_source_type AS ENUM (
  'quran', 'hadith', 'sirah', 'tarikh', 'academic', 'primary_document', 'archaeology', 'other'
);

CREATE TYPE public.story_source_reliability AS ENUM (
  'authenticated', 'accepted', 'weak', 'disputed', 'unverified'
);

-- =====================================================================
-- 2. TABLE: story_collections
-- =====================================================================
CREATE TABLE public.story_collections (
  id                     text PRIMARY KEY,
  slug                   text NOT NULL UNIQUE,
  title_ar               text NOT NULL,
  title_en               text,
  summary_ar             text,
  summary_en             text,
  world_slug             text,
  cover_media_id         uuid REFERENCES public.story_media(id) ON DELETE SET NULL,
  display_order          integer NOT NULL DEFAULT 0,
  production_status      public.story_production_status NOT NULL,
  schema_version         smallint NOT NULL DEFAULT 2,
  tags                   text[] NOT NULL DEFAULT '{}',
  metadata               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  published_at           timestamptz
);

GRANT SELECT ON public.story_collections TO anon, authenticated;
GRANT ALL ON public.story_collections TO service_role;
ALTER TABLE public.story_collections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_collections_public_read_completed"
  ON public.story_collections FOR SELECT
  TO anon, authenticated
  USING (production_status = 'completed'::public.story_production_status);

CREATE POLICY "story_collections_editor_read_all"
  ON public.story_collections FOR SELECT
  TO authenticated
  USING (public.is_content_editor());

CREATE POLICY "story_collections_editor_write"
  ON public.story_collections FOR ALL
  TO authenticated
  USING (public.is_content_editor())
  WITH CHECK (public.is_content_editor());

CREATE INDEX story_collections_status_order_idx
  ON public.story_collections (production_status, display_order);
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

-- =====================================================================
-- 3. TABLE: story_relations
-- =====================================================================
CREATE TABLE public.story_relations (
  id                text PRIMARY KEY,
  from_story_id     text NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  to_story_id       text NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  relation_type     public.story_relation_type NOT NULL,
  note_ar           text,
  note_en           text,
  display_order     integer NOT NULL DEFAULT 0,
  schema_version    smallint NOT NULL DEFAULT 2,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT story_relations_no_self CHECK (from_story_id <> to_story_id),
  CONSTRAINT story_relations_unique UNIQUE (from_story_id, to_story_id, relation_type)
);

GRANT SELECT ON public.story_relations TO anon, authenticated;
GRANT ALL ON public.story_relations TO service_role;
ALTER TABLE public.story_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_relations_public_read"
  ON public.story_relations FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "story_relations_editor_write"
  ON public.story_relations FOR ALL
  TO authenticated
  USING (public.is_content_editor())
  WITH CHECK (public.is_content_editor());

CREATE INDEX story_relations_from_idx
  ON public.story_relations (from_story_id, relation_type, display_order);
CREATE INDEX story_relations_to_idx
  ON public.story_relations (to_story_id, relation_type);

CREATE OR REPLACE FUNCTION public.story_relations_enforce_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN
    RAISE EXCEPTION 'story_relations.id is immutable';
  END IF;
  IF NEW.from_story_id <> OLD.from_story_id OR NEW.to_story_id <> OLD.to_story_id THEN
    RAISE EXCEPTION 'story_relations endpoints are immutable';
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER story_relations_immutable_trg
  BEFORE UPDATE ON public.story_relations
  FOR EACH ROW EXECUTE FUNCTION public.story_relations_enforce_immutable();

-- =====================================================================
-- 4. TABLE: story_sources
-- =====================================================================
CREATE TABLE public.story_sources (
  id                    text PRIMARY KEY,
  story_id              text NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  source_type           public.story_source_type NOT NULL,
  reliability           public.story_source_reliability NOT NULL DEFAULT 'accepted',
  citation_ar           text NOT NULL,
  citation_en           text,
  reference_locator     text,
  url                   text,
  display_order         integer NOT NULL DEFAULT 0,
  schema_version        smallint NOT NULL DEFAULT 2,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.story_sources TO anon, authenticated;
GRANT ALL ON public.story_sources TO service_role;
ALTER TABLE public.story_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_sources_public_read"
  ON public.story_sources FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "story_sources_editor_write"
  ON public.story_sources FOR ALL
  TO authenticated
  USING (public.is_content_editor())
  WITH CHECK (public.is_content_editor());

CREATE INDEX story_sources_story_idx
  ON public.story_sources (story_id, display_order);
CREATE INDEX story_sources_type_idx
  ON public.story_sources (source_type);

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

-- =====================================================================
-- 5. story_media — collection ownership additions (additive)
-- =====================================================================
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

-- =====================================================================
-- 6. stories.story_collection_id — attach FK
-- =====================================================================
ALTER TABLE public.stories
  ADD CONSTRAINT stories_story_collection_id_fkey
  FOREIGN KEY (story_collection_id)
  REFERENCES public.story_collections(id)
  ON DELETE SET NULL;
