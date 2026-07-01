
-- 1. Extend admin_campaigns with draft + versioning fields
ALTER TABLE public.admin_campaigns
  ADD COLUMN IF NOT EXISTS draft_data jsonb,
  ADD COLUMN IF NOT EXISTS content_version int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS last_editor_email text,
  ADD COLUMN IF NOT EXISTS has_unpublished_changes boolean NOT NULL DEFAULT false;

-- Allow the 'archived' status already used by the UI
ALTER TABLE public.admin_campaigns DROP CONSTRAINT IF EXISTS admin_campaigns_status_check;
ALTER TABLE public.admin_campaigns
  ADD CONSTRAINT admin_campaigns_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]));

-- Backfill: seed draft_data from live data so editing works immediately
UPDATE public.admin_campaigns SET draft_data = data WHERE draft_data IS NULL;

-- 2. Versions table
CREATE TABLE IF NOT EXISTS public.admin_campaign_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL,
  version int NOT NULL,
  title text,
  slug text,
  status text,
  data jsonb NOT NULL,
  editor_id uuid,
  editor_email text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, version)
);

GRANT SELECT, INSERT ON public.admin_campaign_versions TO authenticated;
GRANT ALL ON public.admin_campaign_versions TO service_role;

ALTER TABLE public.admin_campaign_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "editors read campaign versions" ON public.admin_campaign_versions
  FOR SELECT TO authenticated USING (public.is_content_editor());
CREATE POLICY "editors insert campaign versions" ON public.admin_campaign_versions
  FOR INSERT TO authenticated WITH CHECK (public.is_content_editor());

CREATE INDEX IF NOT EXISTS admin_campaign_versions_campaign_idx
  ON public.admin_campaign_versions(campaign_id, version DESC);

-- 3. Save draft (no player-visible change)
CREATE OR REPLACE FUNCTION public.admin_save_campaign_draft(
  p_id text,
  p_title text,
  p_slug text,
  p_draft_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
  existing record;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_id IS NULL OR btrim(p_id) = '' THEN RAISE EXCEPTION 'missing_id'; END IF;
  IF p_draft_data IS NULL THEN RAISE EXCEPTION 'missing_data'; END IF;

  SELECT email INTO uemail FROM auth.users WHERE id = uid;

  SELECT * INTO existing FROM public.admin_campaigns WHERE id = p_id;
  IF NOT FOUND THEN
    -- Create as draft-only campaign
    INSERT INTO public.admin_campaigns (id, slug, title, status, data, draft_data, updated_by, last_editor_email, has_unpublished_changes)
    VALUES (p_id, NULLIF(btrim(p_slug), ''), COALESCE(NULLIF(btrim(p_title), ''), 'بدون عنوان'), 'draft',
            p_draft_data, p_draft_data, uid, uemail, true);
    RETURN jsonb_build_object('ok', true, 'created', true, 'status', 'draft');
  END IF;

  UPDATE public.admin_campaigns
     SET draft_data = p_draft_data,
         title = COALESCE(NULLIF(btrim(p_title), ''), title),
         slug = COALESCE(NULLIF(btrim(p_slug), ''), slug),
         updated_by = uid,
         last_editor_email = uemail,
         has_unpublished_changes = true,
         updated_at = now()
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'created', false);
END $$;

-- 4. Publish (promote draft to live, bump version, snapshot)
CREATE OR REPLACE FUNCTION public.admin_publish_campaign(
  p_id text,
  p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
  row_rec record;
  next_version int;
  final_data jsonb;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT email INTO uemail FROM auth.users WHERE id = uid;

  SELECT * INTO row_rec FROM public.admin_campaigns WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;

  final_data := COALESCE(row_rec.draft_data, row_rec.data);
  IF final_data IS NULL THEN RAISE EXCEPTION 'no_content'; END IF;

  next_version := COALESCE(row_rec.content_version, 1) + 1;

  UPDATE public.admin_campaigns
     SET data = final_data,
         draft_data = final_data,
         status = 'published',
         content_version = next_version,
         published_at = now(),
         has_unpublished_changes = false,
         updated_by = uid,
         last_editor_email = uemail,
         updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.admin_campaign_versions
    (campaign_id, version, title, slug, status, data, editor_id, editor_email, note)
  VALUES
    (p_id, next_version, row_rec.title, row_rec.slug, 'published',
     final_data, uid, uemail, NULLIF(btrim(p_note), ''));

  RETURN jsonb_build_object('ok', true, 'version', next_version, 'published_at', now());
END $$;

-- 5. Restore a version — as draft (safe) or immediate publish
CREATE OR REPLACE FUNCTION public.admin_restore_campaign_version(
  p_id text,
  p_version int,
  p_as_draft boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_row record;
  uid uuid := auth.uid();
  uemail text;
  next_version int;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT email INTO uemail FROM auth.users WHERE id = uid;
  SELECT * INTO v_row FROM public.admin_campaign_versions
    WHERE campaign_id = p_id AND version = p_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_not_found'; END IF;

  IF p_as_draft THEN
    UPDATE public.admin_campaigns
       SET draft_data = v_row.data,
           title = COALESCE(v_row.title, title),
           has_unpublished_changes = true,
           updated_by = uid,
           last_editor_email = uemail,
           updated_at = now()
     WHERE id = p_id;
    RETURN jsonb_build_object('ok', true, 'mode', 'draft', 'restored_from', p_version);
  ELSE
    SELECT COALESCE(content_version, 1) + 1 INTO next_version FROM public.admin_campaigns WHERE id = p_id;
    UPDATE public.admin_campaigns
       SET data = v_row.data,
           draft_data = v_row.data,
           title = COALESCE(v_row.title, title),
           status = 'published',
           content_version = next_version,
           published_at = now(),
           has_unpublished_changes = false,
           updated_by = uid,
           last_editor_email = uemail,
           updated_at = now()
     WHERE id = p_id;
    INSERT INTO public.admin_campaign_versions
      (campaign_id, version, title, slug, status, data, editor_id, editor_email, note)
    VALUES
      (p_id, next_version,
       (SELECT title FROM public.admin_campaigns WHERE id = p_id),
       (SELECT slug FROM public.admin_campaigns WHERE id = p_id),
       'published', v_row.data, uid, uemail,
       'استعادة النسخة ' || p_version);
    RETURN jsonb_build_object('ok', true, 'mode', 'publish', 'restored_from', p_version, 'new_version', next_version);
  END IF;
END $$;

-- 6. List versions
CREATE OR REPLACE FUNCTION public.admin_list_campaign_versions(p_id text)
RETURNS TABLE(version int, title text, editor_email text, note text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT v.version, v.title, v.editor_email, v.note, v.created_at
  FROM public.admin_campaign_versions v
  WHERE v.campaign_id = p_id AND public.is_content_editor()
  ORDER BY v.version DESC
  LIMIT 100;
$$;

-- 7. Progress stats for delete-protection (per chapter completion counts)
CREATE OR REPLACE FUNCTION public.admin_campaign_progress_stats(p_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  total_players int;
  completed_campaign int;
  per_chapter jsonb;
BEGIN
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT count(DISTINCT user_id) INTO total_players
    FROM public.user_campaign_progress WHERE campaign_id = p_id;

  SELECT count(DISTINCT user_id) INTO completed_campaign
    FROM public.user_campaign_progress
    WHERE campaign_id = p_id AND status = 'completed';

  SELECT coalesce(jsonb_object_agg(chapter_id, cnt), '{}'::jsonb) INTO per_chapter
  FROM (
    SELECT chapter_id, count(DISTINCT user_id) AS cnt
    FROM public.user_campaign_progress
    WHERE campaign_id = p_id AND completed_at IS NOT NULL
    GROUP BY chapter_id
  ) s;

  RETURN jsonb_build_object(
    'total_players', COALESCE(total_players, 0),
    'completed_campaign', COALESCE(completed_campaign, 0),
    'per_chapter_completed', per_chapter
  );
END $$;
