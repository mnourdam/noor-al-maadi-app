
CREATE TABLE IF NOT EXISTS public.user_achievements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  rewards_granted_at timestamptz,
  rewards_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  engine_version integer NOT NULL DEFAULT 2,
  definition_version integer NOT NULL DEFAULT 1,
  client_unlocked_at timestamptz,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS user_achievements_user_idx
  ON public.user_achievements (user_id, unlocked_at DESC);

GRANT SELECT, INSERT ON public.user_achievements TO authenticated;
GRANT ALL ON public.user_achievements TO service_role;

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_achievements_select_own"
  ON public.user_achievements
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_achievements_insert_own"
  ON public.user_achievements
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
