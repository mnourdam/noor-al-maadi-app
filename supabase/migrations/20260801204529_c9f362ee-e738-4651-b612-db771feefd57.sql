CREATE TABLE IF NOT EXISTS public.user_story_unlock_notices (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id text NOT NULL,
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_story_unlock_notices TO authenticated;
GRANT ALL ON public.user_story_unlock_notices TO service_role;

ALTER TABLE public.user_story_unlock_notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Players manage their own unlock notices"
ON public.user_story_unlock_notices
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);