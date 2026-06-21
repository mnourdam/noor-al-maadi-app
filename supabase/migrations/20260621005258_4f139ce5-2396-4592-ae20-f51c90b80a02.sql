-- 1. Add timeline columns
ALTER TABLE public.encyclopedia_entities
  ADD COLUMN IF NOT EXISTS timeline_year int,
  ADD COLUMN IF NOT EXISTS timeline_start_year int,
  ADD COLUMN IF NOT EXISTS timeline_end_year int,
  ADD COLUMN IF NOT EXISTS timeline_hijri text,
  ADD COLUMN IF NOT EXISTS timeline_order int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timeline_category text,
  ADD COLUMN IF NOT EXISTS timeline_tone text,
  ADD COLUMN IF NOT EXISTS timeline_glyph text;

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_enc_entities_enabled_timeline_year
  ON public.encyclopedia_entities (enabled, timeline_year)
  WHERE timeline_year IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enc_entities_enabled_timeline_start
  ON public.encyclopedia_entities (enabled, timeline_start_year)
  WHERE timeline_start_year IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_enc_entities_enabled_cat_year
  ON public.encyclopedia_entities (enabled, timeline_category, timeline_year);

-- 3. Backfill from metadata (only when destination is null)
UPDATE public.encyclopedia_entities
SET timeline_year = NULLIF((metadata->>'timelinePosition'), '')::int
WHERE timeline_year IS NULL
  AND metadata ? 'timelinePosition'
  AND (metadata->>'timelinePosition') ~ '^-?\d+$';

UPDATE public.encyclopedia_entities
SET timeline_start_year = NULLIF((metadata->'period'->>'startYear'), '')::int
WHERE timeline_start_year IS NULL
  AND metadata->'period' ? 'startYear'
  AND (metadata->'period'->>'startYear') ~ '^-?\d+$';

UPDATE public.encyclopedia_entities
SET timeline_end_year = NULLIF((metadata->'period'->>'endYear'), '')::int
WHERE timeline_end_year IS NULL
  AND metadata->'period' ? 'endYear'
  AND (metadata->'period'->>'endYear') ~ '^-?\d+$';

UPDATE public.encyclopedia_entities
SET timeline_category = CASE entity_type
  WHEN 'state'    THEN 'caliphate'
  WHEN 'figure'   THEN 'figure'
  WHEN 'battle'   THEN 'battle'
  WHEN 'artifact' THEN 'book'
  WHEN 'event'    THEN 'event'
  WHEN 'city'     THEN 'event'
  WHEN 'landmark' THEN 'event'
  ELSE NULL
END
WHERE timeline_category IS NULL;
