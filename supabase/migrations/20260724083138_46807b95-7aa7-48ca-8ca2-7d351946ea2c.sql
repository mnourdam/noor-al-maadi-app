CREATE OR REPLACE FUNCTION public.admin_story_delete_impact(p_ids text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      s.id,
      s.slug,
      s.title_ar,
      s.status,
      (SELECT count(*)::int FROM public.story_scenes sc WHERE sc.story_id = s.id) AS scenes,
      (SELECT count(*)::int FROM public.story_media m WHERE m.story_id = s.id AND m.owner_scope = 'story') AS story_media,
      (SELECT count(*)::int FROM public.story_media m WHERE m.collection_id = s.story_collection_id AND m.owner_scope = 'collection') AS collection_media,
      (SELECT count(*)::int FROM public.user_story_progress p WHERE p.story_id = s.id) AS progress_rows,
      (SELECT count(*)::int FROM public.user_story_completions c WHERE c.story_id = s.id) AS completions,
      (SELECT count(*)::int FROM public.social_comments c WHERE c.anchor_type = 'story' AND c.anchor_id::text = s.id) AS comments,
      (SELECT count(*)::int FROM public.social_comments c WHERE c.anchor_type = 'story' AND c.anchor_id::text = s.id AND c.status = 'visible') AS visible_comments,
      (SELECT count(*)::int FROM public.social_comments c WHERE c.anchor_type = 'story' AND c.anchor_id::text = s.id AND c.status = 'hidden') AS hidden_comments,
      (SELECT count(*)::int FROM public.social_comments c WHERE c.anchor_type = 'story' AND c.anchor_id::text = s.id AND c.status = 'removed') AS removed_comments,
      (SELECT count(*)::int FROM public.social_reactions r WHERE r.anchor_type = 'story' AND r.anchor_id::text = s.id) AS reactions
    FROM public.stories s
    WHERE s.id = ANY(p_ids)
  ) x;

  SELECT jsonb_build_object(
    'stories', COALESCE(jsonb_array_length(v_rows), 0),
    'published', COALESCE(SUM(CASE WHEN (r->>'status') = 'published' THEN 1 ELSE 0 END), 0),
    'draft', COALESCE(SUM(CASE WHEN (r->>'status') = 'draft' THEN 1 ELSE 0 END), 0),
    'archived', COALESCE(SUM(CASE WHEN (r->>'status') = 'archived' THEN 1 ELSE 0 END), 0),
    'scenes', COALESCE(SUM((r->>'scenes')::int), 0),
    'story_media', COALESCE(SUM((r->>'story_media')::int), 0),
    'collection_media', COALESCE(SUM((r->>'collection_media')::int), 0),
    'progress', COALESCE(SUM((r->>'progress_rows')::int), 0),
    'completions', COALESCE(SUM((r->>'completions')::int), 0),
    'comments', COALESCE(SUM((r->>'comments')::int), 0),
    'visible_comments', COALESCE(SUM((r->>'visible_comments')::int), 0),
    'hidden_comments', COALESCE(SUM((r->>'hidden_comments')::int), 0),
    'removed_comments', COALESCE(SUM((r->>'removed_comments')::int), 0),
    'reactions', COALESCE(SUM((r->>'reactions')::int), 0)
  )
  INTO v_totals
  FROM jsonb_array_elements(v_rows) r;

  RETURN jsonb_build_object('items', v_rows, 'totals', v_totals);
END;
$$;