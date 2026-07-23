CREATE OR REPLACE FUNCTION public.list_stories_v2(p_world_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_out jsonb;
BEGIN
  WITH base AS (
    SELECT s.*
      FROM public.stories s
     WHERE s.status = 'published'
       AND (p_world_slug IS NULL OR s.world_slug = p_world_slug)
  ),
  scene_counts AS (
    SELECT sc.story_id, count(*)::int AS n
      FROM public.story_scenes sc
     WHERE sc.story_id IN (SELECT id FROM base)
     GROUP BY sc.story_id
  ),
  prereqs_flat AS (
    WITH RECURSIVE walk(story_id, node) AS (
      SELECT b.id, b.unlock_spec FROM base b WHERE b.unlock_spec IS NOT NULL
      UNION ALL
      SELECT w.story_id, ch
        FROM walk w,
             LATERAL jsonb_array_elements(COALESCE(w.node->'children','[]'::jsonb)) AS ch
       WHERE w.node->>'type' IN ('and','or')
    )
    SELECT story_id,
           node->>'type' AS kind,
           node->>'campaign_id' AS campaign_id,
           node->>'investigation_id' AS investigation_id,
           node->>'story_id' AS story_id_ref
      FROM walk
     WHERE node->>'type' IN ('campaign_completed','investigation_completed','story_completed')
  ),
  prereqs_resolved AS (
    SELECT p.story_id,
           jsonb_agg(
             jsonb_build_object(
               'kind', p.kind,
               'ref',  COALESCE(p.campaign_id, p.investigation_id, p.story_id_ref),
               'title',
                 CASE p.kind
                   WHEN 'campaign_completed'      THEN COALESCE(ac.title, p.campaign_id)
                   WHEN 'investigation_completed' THEN COALESCE(inv.title, p.investigation_id)
                   WHEN 'story_completed'         THEN COALESCE(stp.title_ar, p.story_id_ref)
                 END,
               'satisfied',
                 CASE
                   WHEN v_uid IS NULL THEN false
                   WHEN p.kind = 'campaign_completed' THEN
                     EXISTS (SELECT 1 FROM public.user_campaign_completions ucc
                              WHERE ucc.user_id = v_uid AND ucc.campaign_id = p.campaign_id)
                   WHEN p.kind = 'investigation_completed' THEN
                     EXISTS (SELECT 1 FROM public.user_investigation_progress uip
                              WHERE uip.user_id = v_uid
                                AND uip.investigation_id::text = p.investigation_id
                                AND uip.completed_at IS NOT NULL)
                   WHEN p.kind = 'story_completed' THEN
                     EXISTS (SELECT 1 FROM public.user_story_completions usc
                              WHERE usc.user_id = v_uid AND usc.story_id = p.story_id_ref)
                   ELSE false
                 END
             )
             ORDER BY p.kind, COALESCE(p.campaign_id, p.investigation_id, p.story_id_ref)
           ) AS list
      FROM prereqs_flat p
      LEFT JOIN public.admin_campaigns ac ON ac.id = p.campaign_id
      LEFT JOIN public.investigations inv ON inv.id::text = p.investigation_id
      LEFT JOIN public.stories       stp ON stp.id = p.story_id_ref
     GROUP BY p.story_id
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.display_order, x.id), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT
        b.id, b.slug, b.title_ar, b.title_en, b.summary_ar, b.summary_en,
        b.world_slug, b.era, b.display_order, b.xp_reward, b.dinar_reward,
        b.cover_media_id, b.content_version, b.published_at,
        COALESCE(sc.n, 0) AS scene_count,
        COALESCE(pr.list, '[]'::jsonb) AS prereqs,
        CASE
          WHEN v_uid IS NULL THEN
            (b.unlock_spec->>'type') IS NULL OR (b.unlock_spec->>'type') = 'always'
          ELSE public.evaluate_unlock_spec(v_uid, b.unlock_spec)
        END AS unlocked,
        CASE
          WHEN v_uid IS NULL THEN false
          ELSE EXISTS (SELECT 1 FROM public.user_story_completions c
                        WHERE c.user_id = v_uid AND c.story_id = b.id)
        END AS completed,
        CASE
          WHEN v_uid IS NULL THEN NULL
          ELSE (
            SELECT jsonb_build_object(
              'last_scene_index', p.last_scene_index,
              'max_scene_index_reached', p.max_scene_index_reached
            )
              FROM public.user_story_progress p
             WHERE p.user_id = v_uid AND p.story_id = b.id
          )
        END AS progress
      FROM base b
      LEFT JOIN scene_counts     sc ON sc.story_id = b.id
      LEFT JOIN prereqs_resolved pr ON pr.story_id = b.id
    ) x;

  RETURN v_out;
END $function$;