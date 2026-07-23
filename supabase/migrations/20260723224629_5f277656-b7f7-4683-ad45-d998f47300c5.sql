
-- M1: Stories Content Contract v2 Core — Enums and Columns

-- Enums (guarded)
DO $$ BEGIN
  CREATE TYPE public.story_category AS ENUM (
    'seerah','sahabah','tabieen','battles','conquests','scholars',
    'dynasties','civilization','places','artifacts','manuscripts','events'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.story_rarity AS ENUM ('standard','featured','rare','legendary');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.story_production_status AS ENUM ('imported','drafting','in_review','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.story_lock_visibility AS ENUM ('visible','mystery','hidden');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.story_historical_confidence AS ENUM ('established','disputed','weak');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Columns on public.stories (all nullable at M1; backfill + NOT NULL happens in later migrations)
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS category public.story_category,
  ADD COLUMN IF NOT EXISTS rarity public.story_rarity NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS production_status public.story_production_status NOT NULL DEFAULT 'imported',
  ADD COLUMN IF NOT EXISTS lock_visibility public.story_lock_visibility NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS historical_confidence public.story_historical_confidence,
  ADD COLUMN IF NOT EXISTS hijri_start_year integer,
  ADD COLUMN IF NOT EXISTS hijri_end_year integer,
  ADD COLUMN IF NOT EXISTS gregorian_start date,
  ADD COLUMN IF NOT EXISTS gregorian_end date,
  ADD COLUMN IF NOT EXISTS story_collection_id text;

-- Backfill production_status from status for existing rows
UPDATE public.stories
   SET production_status = CASE
     WHEN status IN ('published','archived') THEN 'completed'::public.story_production_status
     WHEN status = 'draft' THEN 'imported'::public.story_production_status
     ELSE production_status
   END
 WHERE production_status = 'imported';

-- Indexes to support upcoming read paths
CREATE INDEX IF NOT EXISTS stories_category_idx ON public.stories (category);
CREATE INDEX IF NOT EXISTS stories_rarity_idx ON public.stories (rarity);
CREATE INDEX IF NOT EXISTS stories_lock_visibility_idx ON public.stories (lock_visibility);
CREATE INDEX IF NOT EXISTS stories_production_status_idx ON public.stories (production_status);
CREATE INDEX IF NOT EXISTS stories_story_collection_id_idx ON public.stories (story_collection_id);
CREATE INDEX IF NOT EXISTS stories_hijri_year_idx ON public.stories (hijri_start_year, hijri_end_year);
CREATE INDEX IF NOT EXISTS stories_gregorian_idx ON public.stories (gregorian_start, gregorian_end);
