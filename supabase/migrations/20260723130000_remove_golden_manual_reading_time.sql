-- Phase 3 precedence change: remove the manual reading-time override
-- from the Golden Story so its displayed duration comes from the actual
-- cinematic runtime. Also strips the legacy `reading_time_minutes` key
-- across all stories (the field is no longer read; only the explicit
-- `use_manual_reading_time` + `reading_time_override_minutes` pair is
-- honored going forward).
UPDATE public.stories
   SET metadata = COALESCE(metadata, '{}'::jsonb)
       - 'reading_time_minutes'
       - 'reading_time_override_minutes'
       - 'use_manual_reading_time'
 WHERE id = 'wfaa-alnby-raq7';

UPDATE public.stories
   SET metadata = metadata - 'reading_time_minutes'
 WHERE metadata ? 'reading_time_minutes';
