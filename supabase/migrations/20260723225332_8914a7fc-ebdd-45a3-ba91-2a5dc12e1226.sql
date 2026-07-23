
-- =========================================================
-- M1 REPAIR — Stories v2 Core
-- =========================================================

BEGIN;

-- ---------- 1. Replace enums with wrong labels ----------

-- story_category: current labels (seerah, sahabah, ...) diverge from frozen contract.
-- All existing rows have category IS NULL, so we can safely swap the type.
ALTER TYPE public.story_category RENAME TO story_category__drift;
CREATE TYPE public.story_category AS ENUM (
  'event','character','city','landmark','battle','artifact',
  'document','daily_life','analysis','alternate_history'
);
ALTER TABLE public.stories ALTER COLUMN category DROP DEFAULT;
ALTER TABLE public.stories
  ALTER COLUMN category TYPE public.story_category
  USING NULL::public.story_category;
UPDATE public.stories SET category = 'event' WHERE category IS NULL;
ALTER TABLE public.stories ALTER COLUMN category SET NOT NULL;
ALTER TABLE public.stories ALTER COLUMN category SET DEFAULT 'event';
DROP TYPE public.story_category__drift;

-- story_production_status: existing rows use 'completed' which exists in the new enum.
ALTER TYPE public.story_production_status RENAME TO story_production_status__drift;
CREATE TYPE public.story_production_status AS ENUM (
  'idea','research','writing','json_ready','imported',
  'images_in_progress','images_linked','testing','completed'
);
ALTER TABLE public.stories ALTER COLUMN production_status DROP DEFAULT;
ALTER TABLE public.stories
  ALTER COLUMN production_status TYPE public.story_production_status
  USING production_status::text::public.story_production_status;
-- Frozen contract: NOT NULL, no DB default. Backfill happens explicitly below.
UPDATE public.stories SET production_status = 'completed' WHERE status = 'published' AND production_status IS DISTINCT FROM 'completed';
UPDATE public.stories SET production_status = 'completed' WHERE status = 'archived'  AND production_status IS DISTINCT FROM 'completed';
UPDATE public.stories SET production_status = 'imported'  WHERE status = 'draft'     AND production_status IS DISTINCT FROM 'imported';
ALTER TABLE public.stories ALTER COLUMN production_status SET NOT NULL;
DROP TYPE public.story_production_status__drift;

-- story_historical_confidence: all rows NULL; swap freely.
ALTER TYPE public.story_historical_confidence RENAME TO story_historical_confidence__drift;
CREATE TYPE public.story_historical_confidence AS ENUM (
  'established','debated','speculative','alternate'
);
ALTER TABLE public.stories
  ALTER COLUMN historical_confidence TYPE public.story_historical_confidence
  USING NULL::public.story_historical_confidence;
UPDATE public.stories SET historical_confidence = 'established' WHERE historical_confidence IS NULL;
ALTER TABLE public.stories ALTER COLUMN historical_confidence SET NOT NULL;
ALTER TABLE public.stories ALTER COLUMN historical_confidence SET DEFAULT 'established';
DROP TYPE public.story_historical_confidence__drift;

-- ---------- 2. Create missing enums (guarded) ----------

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'story_time_precision') THEN
    CREATE TYPE public.story_time_precision AS ENUM
      ('day','month','year','decade','century','period','unknown');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'story_length_class') THEN
    CREATE TYPE public.story_length_class AS ENUM ('short','standard','epic');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'story_snapshot_tier') THEN
    CREATE TYPE public.story_snapshot_tier AS ENUM ('core','standard','on_demand');
  END IF;
END $$;

-- ---------- 3. Add missing stories columns ----------

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS schema_version    smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS collection_order  integer  NULL,
  ADD COLUMN IF NOT EXISTS hijri_start_month smallint NULL,
  ADD COLUMN IF NOT EXISTS hijri_start_day   smallint NULL,
  ADD COLUMN IF NOT EXISTS hijri_end_month   smallint NULL,
  ADD COLUMN IF NOT EXISTS hijri_end_day     smallint NULL,
  ADD COLUMN IF NOT EXISTS time_precision    public.story_time_precision NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS length_class      public.story_length_class   NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS tags              text[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS snapshot_tier     public.story_snapshot_tier  NOT NULL DEFAULT 'standard';

-- Frozen contract mandates smallint for hijri year components.
ALTER TABLE public.stories ALTER COLUMN hijri_start_year TYPE smallint USING hijri_start_year::smallint;
ALTER TABLE public.stories ALTER COLUMN hijri_end_year   TYPE smallint USING hijri_end_year::smallint;

-- ---------- 4. Scene schema version ----------

ALTER TABLE public.story_scenes
  ADD COLUMN IF NOT EXISTS schema_version smallint NOT NULL DEFAULT 2;

-- ---------- 5. Date constraints ----------

ALTER TABLE public.stories
  ADD CONSTRAINT stories_hijri_start_month_range
    CHECK (hijri_start_month IS NULL OR hijri_start_month BETWEEN 1 AND 12) NOT VALID;
ALTER TABLE public.stories
  ADD CONSTRAINT stories_hijri_end_month_range
    CHECK (hijri_end_month IS NULL OR hijri_end_month BETWEEN 1 AND 12) NOT VALID;
ALTER TABLE public.stories
  ADD CONSTRAINT stories_hijri_start_day_range
    CHECK (hijri_start_day IS NULL OR hijri_start_day BETWEEN 1 AND 30) NOT VALID;
ALTER TABLE public.stories
  ADD CONSTRAINT stories_hijri_end_day_range
    CHECK (hijri_end_day IS NULL OR hijri_end_day BETWEEN 1 AND 30) NOT VALID;
ALTER TABLE public.stories
  ADD CONSTRAINT stories_hijri_start_hierarchy
    CHECK (
      (hijri_start_month IS NULL OR hijri_start_year IS NOT NULL) AND
      (hijri_start_day   IS NULL OR hijri_start_month IS NOT NULL)
    ) NOT VALID;
ALTER TABLE public.stories
  ADD CONSTRAINT stories_hijri_end_hierarchy
    CHECK (
      (hijri_end_month IS NULL OR hijri_end_year IS NOT NULL) AND
      (hijri_end_day   IS NULL OR hijri_end_month IS NOT NULL)
    ) NOT VALID;
ALTER TABLE public.stories
  ADD CONSTRAINT stories_gregorian_range
    CHECK (gregorian_end IS NULL OR gregorian_start IS NULL OR gregorian_end >= gregorian_start) NOT VALID;
ALTER TABLE public.stories
  ADD CONSTRAINT stories_hijri_range
    CHECK (
      hijri_end_year IS NULL OR hijri_start_year IS NULL OR
      hijri_end_year > hijri_start_year OR
      (hijri_end_year = hijri_start_year AND (
        hijri_end_month IS NULL OR hijri_start_month IS NULL OR
        hijri_end_month > hijri_start_month OR
        (hijri_end_month = hijri_start_month AND (
          hijri_end_day IS NULL OR hijri_start_day IS NULL OR hijri_end_day >= hijri_start_day
        ))
      ))
    ) NOT VALID;

ALTER TABLE public.stories VALIDATE CONSTRAINT stories_hijri_start_month_range;
ALTER TABLE public.stories VALIDATE CONSTRAINT stories_hijri_end_month_range;
ALTER TABLE public.stories VALIDATE CONSTRAINT stories_hijri_start_day_range;
ALTER TABLE public.stories VALIDATE CONSTRAINT stories_hijri_end_day_range;
ALTER TABLE public.stories VALIDATE CONSTRAINT stories_hijri_start_hierarchy;
ALTER TABLE public.stories VALIDATE CONSTRAINT stories_hijri_end_hierarchy;
ALTER TABLE public.stories VALIDATE CONSTRAINT stories_gregorian_range;
ALTER TABLE public.stories VALIDATE CONSTRAINT stories_hijri_range;

-- ---------- 6. Immutable-ID guards ----------

CREATE OR REPLACE FUNCTION public.stories_prevent_id_slug_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'stories.id is immutable (attempted %→%)', OLD.id, NEW.id;
  END IF;
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'stories.slug is immutable (attempted %→%)', OLD.slug, NEW.slug;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stories_immutable_id ON public.stories;
CREATE TRIGGER trg_stories_immutable_id
  BEFORE UPDATE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.stories_prevent_id_slug_change();

CREATE OR REPLACE FUNCTION public.story_scenes_prevent_id_reparent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'story_scenes.id is immutable (attempted %→%)', OLD.id, NEW.id;
  END IF;
  IF NEW.story_id IS DISTINCT FROM OLD.story_id THEN
    RAISE EXCEPTION 'story_scenes cannot be reparented (attempted %→%)', OLD.story_id, NEW.story_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_story_scenes_immutable_id ON public.story_scenes;
CREATE TRIGGER trg_story_scenes_immutable_id
  BEFORE UPDATE ON public.story_scenes
  FOR EACH ROW EXECUTE FUNCTION public.story_scenes_prevent_id_reparent();

-- ---------- 7. Missing indexes ----------

CREATE INDEX IF NOT EXISTS stories_snapshot_tier_idx    ON public.stories (snapshot_tier);
CREATE INDEX IF NOT EXISTS stories_time_precision_idx   ON public.stories (time_precision);
CREATE INDEX IF NOT EXISTS stories_tags_gin_idx         ON public.stories USING GIN (tags);
CREATE INDEX IF NOT EXISTS stories_collection_order_idx ON public.stories (story_collection_id, collection_order, display_order);
-- Category, rarity, lock_visibility, production_status, story_collection_id, hijri_start_year,
-- gregorian_start indexes already exist or are covered by existing compound indexes.

COMMIT;
