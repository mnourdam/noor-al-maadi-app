
-- 1) Leaderboard snapshots: restrict raw table reads to admins/editors.
DROP POLICY IF EXISTS "snapshots_read_authenticated" ON public.leaderboard_snapshots;
CREATE POLICY "snapshots_read_admin"
  ON public.leaderboard_snapshots
  FOR SELECT
  TO authenticated
  USING (public.is_content_editor());

-- 2) Content registry: add status column and filter public reads.
ALTER TABLE public.content_registry
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'published';

DROP POLICY IF EXISTS "public read registry" ON public.content_registry;
CREATE POLICY "public read published registry"
  ON public.content_registry
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published' OR public.is_content_editor());

-- 3) Fix mutable search_path on remaining SECURITY DEFINER helpers.
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq;
ALTER FUNCTION public.leaderboard_resolve_metric(text) SET search_path = public;
