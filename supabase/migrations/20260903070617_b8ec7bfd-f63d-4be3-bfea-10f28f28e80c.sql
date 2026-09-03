-- Phase 2: set-wise / index-friendly rewrite of the story-list unlock path.
-- Signatures, return shapes and semantics are unchanged.

-- Strict canonical-lowercase UUID guard so text->uuid comparison is exactly
-- equivalent to the previous uuid::text comparison (which only ever matched
-- canonical lowercase output).
CREATE OR REPLACE FUNCTION public._uuid_or_null_v2(p_text text)
 RETURNS uuid
 LANGUAGE sql
 IMMUTABLE
 PARALLEL SAFE
AS $function$
  SELECT CASE
           WHEN p_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN p_text::uuid
           ELSE NULL
         END;
$function$;

-- ---------------------------------------------------------------------------
-- Leaf evaluation: native UUID comparisons, no-op text casts removed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._eval_unlock_node_v2(p_user_id uuid, p_node jsonb, p_depth integer)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type text;
  v_child jsonb;
  v_ids jsonb;
  v_min int;
  v_hit int;
  v_now timestamptz := now();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF p_depth > 6 THEN RETURN false; END IF;
  IF p_node IS NULL OR jsonb_typeof(p_node) <> 'object' THEN RETURN false; END IF;
  v_type := p_node->>'type';

  CASE v_type
    WHEN 'always' THEN
      RETURN true;
    WHEN 'all' THEN
      FOR v_child IN SELECT jsonb_array_elements(COALESCE(p_node->'of','[]'::jsonb)) LOOP
        IF NOT public._eval_unlock_node_v2(p_user_id, v_child, p_depth + 1) THEN RETURN false; END IF;
      END LOOP;
      RETURN true;
    WHEN 'any' THEN
      FOR v_child IN SELECT jsonb_array_elements(COALESCE(p_node->'of','[]'::jsonb)) LOOP
        IF public._eval_unlock_node_v2(p_user_id, v_child, p_depth + 1) THEN RETURN true; END IF;
      END LOOP;
      RETURN false;
    WHEN 'not' THEN
      IF NOT (p_node ? 'child') THEN RETURN false; END IF;
      RETURN NOT public._eval_unlock_node_v2(p_user_id, p_node->'child', p_depth + 1);

    WHEN 'story_complete' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_story_completions
         WHERE user_id = p_user_id AND story_id = p_node->>'story_id'
      );
    WHEN 'campaign_complete' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_campaign_completions
         WHERE user_id = p_user_id AND campaign_id = p_node->>'campaign_id'
      );
    WHEN 'campaign_chapter_complete' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_campaign_progress
         WHERE user_id = p_user_id
           AND campaign_id = p_node->>'campaign_id'
           AND chapter_id  = p_node->>'chapter_id'
           AND (status = 'completed' OR completed_at IS NOT NULL)
      );
    WHEN 'investigation_complete' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_investigation_progress
         WHERE user_id = p_user_id
           AND investigation_id = public._uuid_or_null_v2(p_node->>'investigation_id')
           AND completed_at IS NOT NULL
      );
    WHEN 'entity_discovered' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_entity_discoveries
         WHERE user_id = p_user_id
           AND entity_id = public._uuid_or_null_v2(p_node->>'entity_id')
      );
    WHEN 'entities_discovered' THEN
      v_ids := COALESCE(p_node->'ids','[]'::jsonb);
      BEGIN v_min := (p_node->>'min')::int; EXCEPTION WHEN others THEN v_min := 0; END;
      IF v_min < 1 THEN RETURN false; END IF;
      SELECT count(*)::int INTO v_hit
        FROM jsonb_array_elements_text(v_ids) AS x(id)
        JOIN public.user_entity_discoveries u
          ON u.user_id = p_user_id AND u.entity_id = public._uuid_or_null_v2(x.id);
      RETURN v_hit >= v_min;
    WHEN 'artifact_owned' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_collection
         WHERE user_id = p_user_id
           AND item_id = p_node->>'artifact_id'
      ) OR EXISTS (
        SELECT 1 FROM public.user_entity_discoveries
         WHERE user_id = p_user_id
           AND entity_id = public._uuid_or_null_v2(p_node->>'artifact_id')
           AND (entity_type IS NULL OR entity_type = 'artifact')
      );
    WHEN 'atlas_location_visited' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_entity_discoveries
         WHERE user_id = p_user_id
           AND entity_id = public._uuid_or_null_v2(p_node->>'location_id')
           AND (entity_type IS NULL OR entity_type = 'atlas_location')
      );
    WHEN 'achievement_unlocked' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_achievements
         WHERE user_id = p_user_id AND achievement_id = p_node->>'achievement_id'
      );
    WHEN 'player_level' THEN
      BEGIN v_min := (p_node->>'min')::int; EXCEPTION WHEN others THEN v_min := 0; END;
      IF v_min < 1 THEN RETURN false; END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.profiles
         WHERE id = p_user_id AND COALESCE(level, 0) >= v_min
      );
    WHEN 'date_window' THEN
      BEGIN
        v_start := CASE WHEN p_node ? 'start' THEN (p_node->>'start')::timestamptz ELSE NULL END;
        v_end   := CASE WHEN p_node ? 'end'   THEN (p_node->>'end')::timestamptz   ELSE NULL END;
      EXCEPTION WHEN others THEN
        RETURN false;
      END;
      IF v_start IS NULL AND v_end IS NULL THEN RETURN false; END IF;
      IF v_start IS NOT NULL AND v_now < v_start THEN RETURN false; END IF;
      IF v_end   IS NOT NULL AND v_now > v_end   THEN RETURN false; END IF;
      RETURN true;

    ELSE
      RETURN false;
  END CASE;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Prerequisite resolution: one targeted indexed lookup per leaf instead of
-- four full-table LEFT JOINs per leaf. Output shape/order unchanged.
-- ---------------------------------------------------------------------------
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
  distinct_leaves AS (
    SELECT DISTINCT l.kind, l.ref, public._uuid_or_null_v2(l.ref) AS ref_uuid
      FROM leaves l
     WHERE l.ref IS NOT NULL
  ),
  resolved AS (
    SELECT dl.kind, dl.ref,
           CASE dl.kind
             WHEN 'campaign_complete'      THEN COALESCE(
               (SELECT ac.title FROM public.admin_campaigns ac WHERE ac.id = dl.ref), dl.ref)
             WHEN 'investigation_complete' THEN COALESCE(
               (SELECT inv.title FROM public.investigations inv WHERE inv.id = dl.ref_uuid), dl.ref)
             WHEN 'story_complete'         THEN COALESCE(
               (SELECT stp.title_ar FROM public.stories stp WHERE stp.id = dl.ref), dl.ref)
             WHEN 'entity_discovered'      THEN COALESCE(
               (SELECT ent.title FROM public.encyclopedia_entities ent WHERE ent.id = dl.ref_uuid), dl.ref)
           END AS title,
           CASE
             WHEN p_uid IS NULL THEN false
             WHEN dl.kind = 'campaign_complete' THEN EXISTS (
               SELECT 1 FROM public.user_campaign_completions ucc
                WHERE ucc.user_id = p_uid AND ucc.campaign_id = dl.ref)
             WHEN dl.kind = 'investigation_complete' THEN EXISTS (
               SELECT 1 FROM public.user_investigation_progress uip
                WHERE uip.user_id = p_uid AND uip.investigation_id = dl.ref_uuid
                  AND uip.completed_at IS NOT NULL)
             WHEN dl.kind = 'story_complete' THEN EXISTS (
               SELECT 1 FROM public.user_story_completions usc
                WHERE usc.user_id = p_uid AND usc.story_id = dl.ref)
             WHEN dl.kind = 'entity_discovered' THEN EXISTS (
               SELECT 1 FROM public.user_entity_discoveries ued
                WHERE ued.user_id = p_uid AND ued.entity_id = dl.ref_uuid)
             ELSE false
           END AS satisfied
      FROM distinct_leaves dl
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

-- ---------------------------------------------------------------------------
-- List RPCs: campaign-intro detection computed once per call instead of
-- once per story row. story_is_campaign_intro() itself is left untouched
-- for its other callers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_stories_v3(p_world_slug text DEFAULT NULL::text, p_collection_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_out jsonb;
BEGIN
  WITH intro_ids AS (
    SELECT DISTINCT c.data->>'intro_story_id' AS story_id
      FROM public.admin_campaigns c
     WHERE c.data->>'intro_story_id' IS NOT NULL
  ),
  base AS (
    SELECT s AS row, s.id AS id, s.display_order AS display_order, s.unlock_spec AS unlock_spec
      FROM public.stories s
     WHERE s.status = 'published'
       AND NOT (
             COALESCE(s.metadata->>'kind', '') = 'campaign_intro'
          OR 'campaign-intro' = ANY (COALESCE(s.tags, ARRAY[]::text[]))
          OR EXISTS (SELECT 1 FROM intro_ids i WHERE i.story_id = s.id)
       )
       AND (p_world_slug IS NULL OR s.world_slug = p_world_slug)
       AND (p_collection_id IS NULL OR s.story_collection_id = p_collection_id)
  ),
  scene_counts AS (
    SELECT sc.story_id, count(*)::int AS n
      FROM public.story_scenes sc
     WHERE sc.story_id IN (SELECT id FROM base)
     GROUP BY sc.story_id
  ),
  enriched AS (
    SELECT
      b.row AS row,
      b.id AS id,
      b.display_order AS display_order,
      COALESCE(sc.n, 0) AS scene_count,
      public.evaluate_unlock_spec_v2(v_uid, b.unlock_spec) AS unlocked,
      public._story_prereqs_v2(v_uid, b.unlock_spec) AS prereqs,
      CASE
        WHEN v_uid IS NULL THEN false
        ELSE EXISTS (
          SELECT 1 FROM public.user_story_completions c
           WHERE c.user_id = v_uid AND c.story_id = b.id
        )
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
    LEFT JOIN scene_counts sc ON sc.story_id = b.id
  ),
  redacted AS (
    SELECT public._story_redact_summary_v2(
             e.row, e.unlocked, false, e.scene_count, e.prereqs, e.completed, e.progress
           ) AS row_json,
           e.display_order, e.id
      FROM enriched e
  )
  SELECT COALESCE(jsonb_agg(row_json ORDER BY display_order, id), '[]'::jsonb)
    INTO v_out
    FROM redacted
   WHERE row_json IS NOT NULL;

  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_stories_guest_v3(p_world_slug text DEFAULT NULL::text, p_collection_id text DEFAULT NULL::text, p_evidence jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_out jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RETURN public.list_stories_v3(p_world_slug, p_collection_id);
  END IF;

  WITH intro_ids AS (
    SELECT DISTINCT c.data->>'intro_story_id' AS story_id
      FROM public.admin_campaigns c
     WHERE c.data->>'intro_story_id' IS NOT NULL
  ),
  base AS (
    SELECT s AS row, s.id AS id, s.display_order AS display_order, s.unlock_spec AS unlock_spec
      FROM public.stories s
     WHERE s.status = 'published'
       AND NOT (
             COALESCE(s.metadata->>'kind', '') = 'campaign_intro'
          OR 'campaign-intro' = ANY (COALESCE(s.tags, ARRAY[]::text[]))
          OR EXISTS (SELECT 1 FROM intro_ids i WHERE i.story_id = s.id)
       )
       AND (p_world_slug    IS NULL OR s.world_slug = p_world_slug)
       AND (p_collection_id IS NULL OR s.story_collection_id = p_collection_id)
  ),
  scene_counts AS (
    SELECT sc.story_id, count(*)::int AS n
      FROM public.story_scenes sc
     WHERE sc.story_id IN (SELECT id FROM base)
     GROUP BY sc.story_id
  ),
  enriched AS (
    SELECT b.row AS row, b.id AS id, b.display_order AS display_order,
           COALESCE(sc.n, 0) AS scene_count,
           public.evaluate_unlock_spec_guest_v2(b.unlock_spec, p_evidence) AS unlocked,
           public._story_prereqs_v2(NULL, b.unlock_spec) AS prereqs
      FROM base b
      LEFT JOIN scene_counts sc ON sc.story_id = b.id
  ),
  redacted AS (
    SELECT public._story_redact_summary_v2(
             e.row, e.unlocked, false, e.scene_count, e.prereqs, false, NULL
           ) AS row_json,
           e.display_order, e.id
      FROM enriched e
  )
  SELECT COALESCE(jsonb_agg(row_json ORDER BY display_order, id), '[]'::jsonb)
    INTO v_out
    FROM redacted
   WHERE row_json IS NOT NULL;

  RETURN v_out;
END;
$function$;