
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.user_reflections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('continue','choose','write')),
  choice_index INTEGER,
  choice_value TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_reflections_unique_activity UNIQUE (user_id, campaign_id, activity_id)
);

CREATE INDEX user_reflections_user_updated_idx
  ON public.user_reflections (user_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_reflections TO authenticated;
GRANT ALL ON public.user_reflections TO service_role;

ALTER TABLE public.user_reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players read their own reflections"
  ON public.user_reflections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Players insert their own reflections"
  ON public.user_reflections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Players update their own reflections"
  ON public.user_reflections FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Players delete their own reflections"
  ON public.user_reflections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER user_reflections_touch_updated_at
  BEFORE UPDATE ON public.user_reflections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
