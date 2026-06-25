-- Game mode enum
DO $$ BEGIN
  CREATE TYPE public.game_mode AS ENUM ('crossword','chronology','who_am_i','connections','memory');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.game_status AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Games table
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  mode public.game_mode NOT NULL,
  title text NOT NULL,
  description text,
  difficulty int NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  estimated_time int NOT NULL DEFAULT 5,
  xp_reward int NOT NULL DEFAULT 50,
  coin_reward int NOT NULL DEFAULT 20,
  hearts_penalty int NOT NULL DEFAULT 1,
  related_entities jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  status public.game_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX games_mode_status_idx ON public.games (mode, status);
CREATE INDEX games_status_published_idx ON public.games (status, published_at DESC);

GRANT SELECT ON public.games TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published games are viewable by everyone"
  ON public.games FOR SELECT
  USING (status = 'published' OR public.is_content_editor());

CREATE POLICY "Editors can insert games"
  ON public.games FOR INSERT
  WITH CHECK (public.is_content_editor());

CREATE POLICY "Editors can update games"
  ON public.games FOR UPDATE
  USING (public.is_content_editor())
  WITH CHECK (public.is_content_editor());

CREATE POLICY "Editors can delete games"
  ON public.games FOR DELETE
  USING (public.is_content_editor());

CREATE TRIGGER games_touch_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Game progress
CREATE TABLE public.game_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  stage_index int NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  best_score int NOT NULL DEFAULT 0,
  last_played_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_id)
);

CREATE INDEX game_progress_user_idx ON public.game_progress (user_id, last_played_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_progress TO authenticated;
GRANT ALL ON public.game_progress TO service_role;

ALTER TABLE public.game_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own game progress"
  ON public.game_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own game progress"
  ON public.game_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own game progress"
  ON public.game_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own game progress"
  ON public.game_progress FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER game_progress_touch_updated_at
  BEFORE UPDATE ON public.game_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();