-- ============================================================
-- V16: preserve campaign intro relationship across publishing
-- ROLLBACK COPY of the previous definition is at the bottom of
-- this file (commented) — re-run it verbatim to revert.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_publish_campaign(p_id text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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

  -- Campaign-intro preservation (and ONLY these two fields).
  -- The admin editor does not manage intro relationships, so an absent
  -- intro field in the draft means "not managed", never "removed".
  IF NULLIF(btrim(COALESCE(final_data->>'intro_story_id','')), '') IS NULL
     AND NULLIF(btrim(COALESCE(row_rec.data->>'intro_story_id','')), '') IS NOT NULL THEN
    final_data := final_data || jsonb_build_object('intro_story_id', row_rec.data->'intro_story_id');
    IF final_data->'intro_version' IS NULL AND row_rec.data->'intro_version' IS NOT NULL THEN
      final_data := final_data || jsonb_build_object('intro_version', row_rec.data->'intro_version');
    END IF;
  END IF;

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
END $function$;

-- Backfill: only where published data has a VALID intro story and the
-- draft lacks it. Never invents an intro, never touches other fields.
UPDATE public.admin_campaigns c
   SET draft_data = c.draft_data
       || jsonb_build_object('intro_story_id', c.data->'intro_story_id')
       || CASE WHEN c.data->'intro_version' IS NOT NULL
               THEN jsonb_build_object('intro_version', c.data->'intro_version')
               ELSE '{}'::jsonb END
 WHERE c.draft_data IS NOT NULL
   AND NULLIF(btrim(COALESCE(c.data->>'intro_story_id','')), '') IS NOT NULL
   AND NULLIF(btrim(COALESCE(c.draft_data->>'intro_story_id','')), '') IS NULL
   AND EXISTS (SELECT 1 FROM public.stories s WHERE s.id = c.data->>'intro_story_id');

-- ------------------------------------------------------------
-- ROLLBACK (previous definition, verbatim):
-- CREATE OR REPLACE FUNCTION public.admin_publish_campaign(p_id text, p_note text DEFAULT NULL::text)
--  RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
-- AS $$ ... final_data := COALESCE(row_rec.draft_data, row_rec.data); (no intro preservation) ... $$;
-- ------------------------------------------------------------