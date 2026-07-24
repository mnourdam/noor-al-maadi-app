
-- ============================================================
-- M2 Repair — Stories v2 Core alignment
-- ============================================================

-- ---------- 1) STORY RELATIONS: enums + typed columns + validator ----------

DO $$ BEGIN
  CREATE TYPE public.story_relation_target_type AS ENUM (
    'campaign','campaign_chapter','investigation','encyclopedia_entity',
    'atlas_entity','artifact','achievement','story','collection',
    'today_in_history_event'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.story_relation_role AS ENUM (
    'depicts','mentions','context','prerequisite','sequel_of','prequel_of',
    'related_reading','part_of_collection','answers_investigation',
    'unlocks','source_context'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.story_relations
  DROP CONSTRAINT IF EXISTS story_relations_unique;

ALTER TABLE public.story_relations
  ALTER COLUMN target_type TYPE public.story_relation_target_type
    USING target_type::public.story_relation_target_type,
  ALTER COLUMN role TYPE public.story_relation_role
    USING role::public.story_relation_role;

ALTER TABLE public.story_relations
  ADD CONSTRAINT story_relations_unique
    UNIQUE (story_id, target_type, target_id, role);

CREATE OR REPLACE FUNCTION public.story_relations_validate_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_ok boolean;
BEGIN
  IF NEW.target_type = 'artifact' THEN
    RAISE EXCEPTION 'artifact_target_blocked'
      USING HINT = 'Artifact target type is BLOCKED pending canonical definition.';
  END IF;

  v_ok := CASE NEW.target_type
    WHEN 'campaign'               THEN EXISTS (SELECT 1 FROM public.admin_campaigns WHERE id::text = NEW.target_id)
    WHEN 'campaign_chapter'       THEN EXISTS (SELECT 1 FROM public.admin_campaigns WHERE id::text = split_part(NEW.target_id, ':', 1))
    WHEN 'investigation'          THEN EXISTS (SELECT 1 FROM public.investigations WHERE id::text = NEW.target_id)
    WHEN 'encyclopedia_entity'    THEN EXISTS (SELECT 1 FROM public.encyclopedia_entities WHERE id::text = NEW.target_id)
    WHEN 'atlas_entity'           THEN EXISTS (SELECT 1 FROM public.atlas_entities WHERE id::text = NEW.target_id)
    WHEN 'achievement'            THEN EXISTS (SELECT 1 FROM public.achievement_registry WHERE id::text = NEW.target_id)
    WHEN 'story'                  THEN EXISTS (SELECT 1 FROM public.stories WHERE id = NEW.target_id)
    WHEN 'collection'             THEN EXISTS (SELECT 1 FROM public.story_collections WHERE id = NEW.target_id)
    WHEN 'today_in_history_event' THEN EXISTS (SELECT 1 FROM public.today_in_history_events WHERE id::text = NEW.target_id)
    ELSE FALSE
  END;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'story_relation_target_not_found: % %', NEW.target_type, NEW.target_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS story_relations_validate_target_trg ON public.story_relations;
CREATE TRIGGER story_relations_validate_target_trg
BEFORE INSERT OR UPDATE OF target_type, target_id ON public.story_relations
FOR EACH ROW EXECUTE FUNCTION public.story_relations_validate_target();

-- ---------- 2) STORY SOURCES: enum + exact frozen columns ----------

DO $$ BEGIN
  CREATE TYPE public.story_source_kind AS ENUM (
    'primary','secondary','tertiary','museum','archive','translation','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.story_sources
  DROP CONSTRAINT IF EXISTS story_sources_unique;

ALTER TABLE public.story_sources
  DROP COLUMN IF EXISTS reference_locator,
  DROP COLUMN IF EXISTS metadata,
  DROP COLUMN IF EXISTS schema_version,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE public.story_sources
  ALTER COLUMN kind DROP DEFAULT,
  ALTER COLUMN kind TYPE public.story_source_kind
    USING NULLIF(kind, '')::public.story_source_kind;

ALTER TABLE public.story_sources
  ADD COLUMN IF NOT EXISTS title  text,
  ADD COLUMN IF NOT EXISTS author text,
  ADD COLUMN IF NOT EXISTS year   text,
  ADD COLUMN IF NOT EXISTS page   text,
  ADD COLUMN IF NOT EXISTS weight integer,
  ADD COLUMN IF NOT EXISTS notes  text;

ALTER TABLE public.story_sources
  ALTER COLUMN citation SET NOT NULL,
  ALTER COLUMN kind     SET NOT NULL;

ALTER TABLE public.story_sources
  ADD CONSTRAINT story_sources_unique UNIQUE (story_id, source_key);

-- ---------- 3) STORY COLLECTIONS: drop drifted extras ----------

DROP INDEX IF EXISTS public.story_collections_world_slug_idx;
DROP INDEX IF EXISTS public.story_collections_tags_gin;

ALTER TABLE public.story_collections
  DROP COLUMN IF EXISTS world_slug,
  DROP COLUMN IF EXISTS schema_version,
  DROP COLUMN IF EXISTS tags;

-- ---------- 4) STORY MEDIA: owner_scope model ----------

-- Remove 19 confirmed-orphan pre-M2 rows (story_id NULL, zero references).
DELETE FROM public.story_media m
 WHERE m.ownership = 'story-owned'
   AND m.story_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.stories s        WHERE s.cover_media_id = m.id)
   AND NOT EXISTS (SELECT 1 FROM public.story_scenes sc  WHERE sc.primary_media_id = m.id)
   AND NOT EXISTS (SELECT 1 FROM public.story_collections c WHERE c.cover_media_id = m.id);

ALTER TABLE public.story_media
  DROP CONSTRAINT IF EXISTS story_media_ownership_check;

ALTER INDEX IF EXISTS public.story_media_ownership_idx
  RENAME TO story_media_owner_scope_idx;

ALTER TABLE public.story_media
  RENAME COLUMN ownership TO owner_scope;

UPDATE public.story_media
   SET owner_scope = 'story'
 WHERE owner_scope IN ('story-owned', 'shared');

UPDATE public.story_media
   SET owner_scope = 'collection'
 WHERE owner_scope = 'collection-owned';

ALTER TABLE public.story_media
  ALTER COLUMN owner_scope SET DEFAULT 'story';

ALTER TABLE public.story_media
  ADD CONSTRAINT story_media_owner_scope_check
    CHECK (owner_scope IN ('story','collection'));

ALTER TABLE public.story_media
  ADD CONSTRAINT story_media_owner_scope_pairing_check
    CHECK (
      (owner_scope = 'story'      AND story_id IS NOT NULL AND collection_id IS NULL)
      OR
      (owner_scope = 'collection' AND collection_id IS NOT NULL AND story_id IS NULL)
    );

-- ---------- 5) Keep orphan RPC working under the new column name ----------

DROP FUNCTION IF EXISTS public.admin_list_story_media_orphans(integer);
CREATE FUNCTION public.admin_list_story_media_orphans(
  p_min_age_minutes integer DEFAULT 60
) RETURNS TABLE(
  id              uuid,
  storage_bucket  text,
  storage_path    text,
  byte_size       integer,
  kind            text,
  preset          text,
  verified        boolean,
  owner_scope     text,
  age_minutes     integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.id, m.storage_bucket, m.storage_path, m.byte_size,
         m.kind, m.preset, m.verified, m.owner_scope,
         (EXTRACT(EPOCH FROM (now() - m.created_at))::integer / 60) AS age_minutes
    FROM public.story_media m
   WHERE m.owner_scope = 'story'
     AND m.created_at < now() - make_interval(mins => GREATEST(p_min_age_minutes, 0))
     AND public.story_media_reference_count(m.id) = 0;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_story_media_orphans(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_story_media_orphans(integer) TO authenticated;
