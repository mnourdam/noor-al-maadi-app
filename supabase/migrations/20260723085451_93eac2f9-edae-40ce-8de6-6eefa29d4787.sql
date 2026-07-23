
CREATE OR REPLACE FUNCTION public.admin_story_delete_impact(p_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rows jsonb;
  v_totals jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('items', '[]'::jsonb, 'totals', jsonb_build_object());
  END IF;

  -- Type contract:
  --   stories.id                        TEXT (stable slug-style id)
  --   story_scenes.story_id             TEXT
  --   story_media.story_id              TEXT   + ownership TEXT ('story-owned'|'shared')
  --   user_story_progress.story_id      TEXT
  --   user_story_completions.story_id   TEXT
  --   social_comments.anchor_id         UUID   (frozen social design; status TEXT: visible|hidden|removed|pending)
  --   social_reactions.anchor_id        UUID
  -- Social anchor boundary is UUID; cast anchor_id::text = s.id at that boundary only.
  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT
        s.id,
        s.slug,
        s.title_ar,
        s.status,
        (SELECT count(*)::int FROM public.story_scenes sc WHERE sc.story_id = s.id) AS scenes,
        (SELECT count(*)::int FROM public.story_media  m
          WHERE m.story_id = s.id AND m.ownership = 'story-owned') AS owned_media,
        (SELECT count(*)::int FROM public.story_media  m
          WHERE m.story_id = s.id AND m.ownership = 'shared')     AS shared_media,
        (SELECT count(*)::int FROM public.user_story_progress p
          WHERE p.story_id = s.id) AS progress_rows,
        (SELECT count(*)::int FROM public.user_story_completions c
          WHERE c.story_id = s.id) AS completions,
        (SELECT count(*)::int FROM public.social_comments c
          WHERE c.anchor_type = 'story' AND c.anchor_id::text = s.id) AS comments,
        (SELECT count(*)::int FROM public.social_comments c
          WHERE c.anchor_type = 'story' AND c.anchor_id::text = s.id
            AND c.status = 'visible') AS visible_comments,
        (SELECT count(*)::int FROM public.social_comments c
          WHERE c.anchor_type = 'story' AND c.anchor_id::text = s.id
            AND c.status = 'hidden') AS hidden_comments,
        (SELECT count(*)::int FROM public.social_comments c
          WHERE c.anchor_type = 'story' AND c.anchor_id::text = s.id
            AND c.status = 'removed') AS removed_comments,
        (SELECT count(*)::int FROM public.social_reactions r
          WHERE r.anchor_type = 'story' AND r.anchor_id::text = s.id) AS reactions
      FROM public.stories s
      WHERE s.id = ANY(p_ids)
    ) x;

  SELECT jsonb_build_object(
    'stories',           COALESCE(jsonb_array_length(v_rows), 0),
    'published',         COALESCE(SUM(CASE WHEN (r->>'status') = 'published' THEN 1 ELSE 0 END), 0),
    'draft',             COALESCE(SUM(CASE WHEN (r->>'status') = 'draft'     THEN 1 ELSE 0 END), 0),
    'archived',          COALESCE(SUM(CASE WHEN (r->>'status') = 'archived'  THEN 1 ELSE 0 END), 0),
    'scenes',            COALESCE(SUM((r->>'scenes')::int), 0),
    'owned_media',       COALESCE(SUM((r->>'owned_media')::int), 0),
    'shared_media',      COALESCE(SUM((r->>'shared_media')::int), 0),
    'progress',          COALESCE(SUM((r->>'progress_rows')::int), 0),
    'completions',       COALESCE(SUM((r->>'completions')::int), 0),
    'comments',          COALESCE(SUM((r->>'comments')::int), 0),
    'visible_comments',  COALESCE(SUM((r->>'visible_comments')::int), 0),
    'hidden_comments',   COALESCE(SUM((r->>'hidden_comments')::int), 0),
    'removed_comments',  COALESCE(SUM((r->>'removed_comments')::int), 0),
    'reactions',         COALESCE(SUM((r->>'reactions')::int), 0)
  ) INTO v_totals
  FROM jsonb_array_elements(v_rows) r;

  RETURN jsonb_build_object('items', v_rows, 'totals', v_totals);
END; $function$;
