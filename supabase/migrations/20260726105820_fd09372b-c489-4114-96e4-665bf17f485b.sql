ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS lock_explanation text;

CREATE OR REPLACE FUNCTION public._story_prereqs_v2(p_uid uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_norm jsonb;
  v_expr jsonb;
  v_out jsonb;
BEGIN
  IF p_spec IS NULL THEN RETURN '[]'::jsonb; END IF;
  v_norm := public.normalize_unlock_spec_v2(p_spec);
  v_expr := v_norm->'expr';
  IF v_expr IS NULL THEN RETURN '[]'::jsonb; END IF;

  WITH RECURSIVE walk(node, depth) AS (
    SELECT v_expr, 1
    UNION ALL
    SELECT ch, w.depth + 1
      FROM walk w
      CROSS JOIN LATERAL (
        SELECT jsonb_array_elements(COALESCE(w.node->'of','[]'::jsonb)) AS ch
         WHERE w.node->>'type' IN ('all','any')
        UNION ALL
        SELECT w.node->'child'
         WHERE w.node->>'type' = 'not' AND w.node ? 'child'
      ) s
     WHERE w.depth < 8
  ),
  leaves AS (
    SELECT node->>'type' AS kind,
           COALESCE(node->>'campaign_id', node->>'investigation_id', node->>'story_id') AS ref
      FROM walk
     WHERE node->>'type' IN ('campaign_complete','investigation_complete','story_complete')
    UNION ALL
    -- entity_discovered: single canonical encyclopedia entity
    SELECT 'entity_discovered', node->>'entity_id'
      FROM walk
     WHERE node->>'type' = 'entity_discovered'
    UNION ALL
    -- entities_discovered: expand the array into one leaf per entity
    SELECT 'entity_discovered', jsonb_array_elements_text(COALESCE(node->'entity_ids','[]'::jsonb))
      FROM walk
     WHERE node->>'type' = 'entities_discovered'
  ),
  resolved AS (
    SELECT DISTINCT l.kind, l.ref,
           CASE l.kind
             WHEN 'campaign_complete'      THEN COALESCE(ac.title, l.ref)
             WHEN 'investigation_complete' THEN COALESCE(inv.title, l.ref)
             WHEN 'story_complete'         THEN COALESCE(stp.title_ar, l.ref)
             WHEN 'entity_discovered'      THEN COALESCE(ent.title, l.ref)
           END AS title,
           CASE
             WHEN p_uid IS NULL THEN false
             WHEN l.kind = 'campaign_complete' THEN EXISTS (
               SELECT 1 FROM public.user_campaign_completions ucc
                WHERE ucc.user_id = p_uid AND ucc.campaign_id = l.ref)
             WHEN l.kind = 'investigation_complete' THEN EXISTS (
               SELECT 1 FROM public.user_investigation_progress uip
                WHERE uip.user_id = p_uid AND uip.investigation_id::text = l.ref
                  AND uip.completed_at IS NOT NULL)
             WHEN l.kind = 'story_complete' THEN EXISTS (
               SELECT 1 FROM public.user_story_completions usc
                WHERE usc.user_id = p_uid AND usc.story_id = l.ref)
             WHEN l.kind = 'entity_discovered' THEN EXISTS (
               SELECT 1 FROM public.user_entity_discoveries ued
                WHERE ued.user_id = p_uid AND ued.entity_id::text = l.ref)
             ELSE false
           END AS satisfied
      FROM leaves l
      LEFT JOIN public.admin_campaigns ac ON ac.id = l.ref
      LEFT JOIN public.investigations inv ON inv.id::text = l.ref
      LEFT JOIN public.stories       stp ON stp.id = l.ref
      LEFT JOIN public.encyclopedia_entities ent ON ent.id::text = l.ref
     WHERE l.ref IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'kind', CASE kind
                       WHEN 'campaign_complete'      THEN 'campaign_completed'
                       WHEN 'investigation_complete' THEN 'investigation_completed'
                       WHEN 'story_complete'         THEN 'story_completed'
                       WHEN 'entity_discovered'      THEN 'entity_discovered'
                     END,
             'ref', ref,
             'title', title,
             'satisfied', satisfied
           ) ORDER BY kind, ref
         ), '[]'::jsonb)
    INTO v_out
    FROM resolved;

  RETURN COALESCE(v_out, '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public._story_redact_summary_v2(p_row stories, p_unlocked boolean, p_is_editor boolean, p_scene_count integer, p_prereqs jsonb, p_completed boolean, p_progress jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_lv text := COALESCE(p_row.lock_visibility::text, 'visible');
BEGIN
  IF p_is_editor OR p_unlocked THEN
    RETURN jsonb_build_object(
      'id', p_row.id,
      'slug', p_row.slug,
      'title_ar', p_row.title_ar,
      'title_en', p_row.title_en,
      'summary_ar', p_row.summary_ar,
      'summary_en', p_row.summary_en,
      'world_slug', p_row.world_slug,
      'era', p_row.era,
      'display_order', p_row.display_order,
      'xp_reward', p_row.xp_reward,
      'dinar_reward', p_row.dinar_reward,
      'cover_media_id', p_row.cover_media_id,
      'content_version', p_row.content_version,
      'published_at', p_row.published_at,
      'category', p_row.category,
      'rarity', p_row.rarity,
      'length_class', p_row.length_class,
      'historical_confidence', p_row.historical_confidence,
      'lock_visibility', v_lv,
      'lock_explanation', NULL,
      'snapshot_tier', p_row.snapshot_tier,
      'tags', COALESCE(to_jsonb(p_row.tags), '[]'::jsonb),
      'story_collection_id', p_row.story_collection_id,
      'collection_order', p_row.collection_order,
      'scene_count', COALESCE(p_scene_count, 0),
      'prereqs', COALESCE(p_prereqs, '[]'::jsonb),
      'unlocked', p_unlocked,
      'completed', COALESCE(p_completed, false),
      'progress', p_progress,
      'is_locked', NOT p_unlocked,
      'is_redacted', false
    );
  END IF;

  IF v_lv = 'hidden' THEN
    RETURN NULL;
  ELSIF v_lv = 'mystery' THEN
    RETURN jsonb_build_object(
      'id', p_row.id,
      'slug', p_row.slug,
      'is_locked', true,
      'lock_visibility', 'mystery',
      'is_redacted', true
    );
  ELSE
    RETURN jsonb_build_object(
      'id', p_row.id,
      'slug', p_row.slug,
      'title_ar', p_row.title_ar,
      'title_en', p_row.title_en,
      'summary_ar', p_row.summary_ar,
      'summary_en', p_row.summary_en,
      'world_slug', p_row.world_slug,
      'era', p_row.era,
      'display_order', p_row.display_order,
      'xp_reward', p_row.xp_reward,
      'dinar_reward', p_row.dinar_reward,
      'cover_media_id', p_row.cover_media_id,
      'content_version', p_row.content_version,
      'published_at', p_row.published_at,
      'category', p_row.category,
      'rarity', p_row.rarity,
      'length_class', p_row.length_class,
      'historical_confidence', p_row.historical_confidence,
      'lock_visibility', 'visible',
      'lock_explanation', NULLIF(btrim(COALESCE(p_row.lock_explanation, '')), ''),
      'snapshot_tier', p_row.snapshot_tier,
      'tags', COALESCE(to_jsonb(p_row.tags), '[]'::jsonb),
      'story_collection_id', p_row.story_collection_id,
      'collection_order', p_row.collection_order,
      'scene_count', COALESCE(p_scene_count, 0),
      'prereqs', COALESCE(p_prereqs, '[]'::jsonb),
      'unlocked', false,
      'completed', false,
      'progress', NULL,
      'is_locked', true,
      'is_redacted', false
    );
  END IF;
END;
$function$;

UPDATE public.stories
   SET lock_explanation = 'اقرأ صفحة مدينة بغداد في الموسوعة حتى نهايتها لفتح هذه القصة.'
 WHERE slug = 'story_baghdad_before_the_storm';