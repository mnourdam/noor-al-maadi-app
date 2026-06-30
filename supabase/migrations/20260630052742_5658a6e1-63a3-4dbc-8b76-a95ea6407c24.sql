ALTER TABLE public.encyclopedia_entities
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_encyclopedia_entities_aliases_gin
  ON public.encyclopedia_entities USING gin (aliases);