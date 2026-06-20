-- Granular per-chapter and per-collection-item progress tables.
-- Additive to the existing JSON-blob save in cloud_saves; do not replace it.

CREATE TABLE IF NOT EXISTS public.user_campaign_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  chapter_id text NOT NULL,
  status text NOT NULL DEFAULT 'unlocked' CHECK (status IN ('locked','unlocked','completed')),
  score integer NOT NULL DEFAULT 0,
  xp_earned integer NOT NULL DEFAULT 0,
  coins_earned integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, campaign_id, chapter_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_campaign_progress TO authenticated;
GRANT ALL ON public.user_campaign_progress TO service_role;

ALTER TABLE public.user_campaign_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ucp_select_own" ON public.user_campaign_progress
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ucp_insert_own" ON public.user_campaign_progress
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ucp_update_own" ON public.user_campaign_progress
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ucp_delete_own" ON public.user_campaign_progress
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS ucp_user_campaign_idx
  ON public.user_campaign_progress(user_id, campaign_id);

CREATE TRIGGER ucp_touch_updated_at
  BEFORE UPDATE ON public.user_campaign_progress
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


CREATE TABLE IF NOT EXISTS public.user_collection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id text NOT NULL,
  item_type text NOT NULL,
  source_campaign_id text,
  source_chapter_id text,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, item_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_collection TO authenticated;
GRANT ALL ON public.user_collection TO service_role;

ALTER TABLE public.user_collection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uc_select_own" ON public.user_collection
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "uc_insert_own" ON public.user_collection
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "uc_delete_own" ON public.user_collection
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS uc_user_idx ON public.user_collection(user_id);