-- ============ _ev_has(p_ev jsonb, p_key text, p_val text) ============
CREATE OR REPLACE FUNCTION public._ev_has(p_ev jsonb, p_key text, p_val text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_val IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(COALESCE(p_ev->p_key, '[]'::jsonb)) = 'array'
           THEN p_ev->p_key ELSE '[]'::jsonb END
    ) AS x(v)
    WHERE x.v = p_val
  );
$function$


-- ============ _eval_unlock_node_guest_v2(p_node jsonb, p_depth integer, p_ev jsonb) ============
CREATE OR REPLACE FUNCTION public._eval_unlock_node_guest_v2(p_node jsonb, p_depth integer, p_ev jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type text;
  v_child jsonb;
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
    WHEN 'always' THEN RETURN true;
    WHEN 'all' THEN
      FOR v_child IN SELECT jsonb_array_elements(COALESCE(p_node->'of','[]'::jsonb)) LOOP
        IF NOT public._eval_unlock_node_guest_v2(v_child, p_depth + 1, p_ev) THEN RETURN false; END IF;
      END LOOP;
      RETURN true;
    WHEN 'any' THEN
      FOR v_child IN SELECT jsonb_array_elements(COALESCE(p_node->'of','[]'::jsonb)) LOOP
        IF public._eval_unlock_node_guest_v2(v_child, p_depth + 1, p_ev) THEN RETURN true; END IF;
      END LOOP;
      RETURN false;
    WHEN 'not' THEN
      IF NOT (p_node ? 'child') THEN RETURN false; END IF;
      RETURN NOT public._eval_unlock_node_guest_v2(p_node->'child', p_depth + 1, p_ev);

    WHEN 'story_complete' THEN
      RETURN public._ev_has(p_ev, 'stories', p_node->>'story_id');
    WHEN 'campaign_complete' THEN
      RETURN public._ev_has(p_ev, 'campaigns', p_node->>'campaign_id');
    WHEN 'campaign_chapter_complete' THEN
      RETURN public._ev_has(p_ev, 'chapters',
        (p_node->>'campaign_id') || '::' || (p_node->>'chapter_id'));
    WHEN 'investigation_complete' THEN
      RETURN public._ev_has(p_ev, 'investigations', p_node->>'investigation_id');
    WHEN 'entity_discovered' THEN
      RETURN public._ev_has(p_ev, 'discovered', p_node->>'entity_id');
    WHEN 'entities_discovered' THEN
      BEGIN v_min := (p_node->>'min')::int; EXCEPTION WHEN others THEN v_min := 0; END;
      IF v_min < 1 THEN RETURN false; END IF;
      SELECT count(*)::int INTO v_hit
        FROM jsonb_array_elements_text(COALESCE(p_node->'ids','[]'::jsonb)) AS x(id)
       WHERE public._ev_has(p_ev, 'discovered', x.id);
      RETURN v_hit >= v_min;
    WHEN 'artifact_owned' THEN
      RETURN public._ev_has(p_ev, 'artifacts', p_node->>'artifact_id')
          OR public._ev_has(p_ev, 'discovered', p_node->>'artifact_id');
    WHEN 'atlas_location_visited' THEN
      RETURN public._ev_has(p_ev, 'atlas', p_node->>'location_id')
          OR public._ev_has(p_ev, 'discovered', p_node->>'location_id');
    WHEN 'achievement_unlocked' THEN
      RETURN public._ev_has(p_ev, 'achievements', p_node->>'achievement_id');
    WHEN 'player_level' THEN
      BEGIN v_min := (p_node->>'min')::int; EXCEPTION WHEN others THEN v_min := 0; END;
      IF v_min < 1 THEN RETURN false; END IF;
      RETURN COALESCE((p_ev->>'level')::int, 0) >= v_min;
    WHEN 'date_window' THEN
      BEGIN
        v_start := CASE WHEN p_node ? 'start' THEN (p_node->>'start')::timestamptz ELSE NULL END;
        v_end   := CASE WHEN p_node ? 'end'   THEN (p_node->>'end')::timestamptz   ELSE NULL END;
      EXCEPTION WHEN others THEN RETURN false;
      END;
      IF v_start IS NULL AND v_end IS NULL THEN RETURN false; END IF;
      IF v_start IS NOT NULL AND v_now < v_start THEN RETURN false; END IF;
      IF v_end   IS NOT NULL AND v_now > v_end   THEN RETURN false; END IF;
      RETURN true;
    ELSE
      RETURN false;
  END CASE;
END;
$function$


-- ============ _eval_unlock_node_v2(p_user_id uuid, p_node jsonb, p_depth integer) ============
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
           AND campaign_id::text = p_node->>'campaign_id'
           AND chapter_id::text  = p_node->>'chapter_id'
           AND (status = 'completed' OR completed_at IS NOT NULL)
      );
    WHEN 'investigation_complete' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_investigation_progress
         WHERE user_id = p_user_id
           AND investigation_id::text = p_node->>'investigation_id'
           AND completed_at IS NOT NULL
      );
    WHEN 'entity_discovered' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_entity_discoveries
         WHERE user_id = p_user_id AND entity_id::text = p_node->>'entity_id'
      );
    WHEN 'entities_discovered' THEN
      v_ids := COALESCE(p_node->'ids','[]'::jsonb);
      BEGIN v_min := (p_node->>'min')::int; EXCEPTION WHEN others THEN v_min := 0; END;
      IF v_min < 1 THEN RETURN false; END IF;
      SELECT count(*)::int INTO v_hit
        FROM jsonb_array_elements_text(v_ids) AS x(id)
        JOIN public.user_entity_discoveries u
          ON u.user_id = p_user_id AND u.entity_id::text = x.id;
      RETURN v_hit >= v_min;
    WHEN 'artifact_owned' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_collection
         WHERE user_id = p_user_id
           AND item_id = p_node->>'artifact_id'
      ) OR EXISTS (
        SELECT 1 FROM public.user_entity_discoveries
         WHERE user_id = p_user_id
           AND entity_id::text = p_node->>'artifact_id'
           AND (entity_type IS NULL OR entity_type = 'artifact')
      );
    WHEN 'atlas_location_visited' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.user_entity_discoveries
         WHERE user_id = p_user_id
           AND entity_id::text = p_node->>'location_id'
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
$function$


-- ============ _story_prereqs_v2(p_uid uuid, p_spec jsonb) ============
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
$function$


-- ============ _story_redact_summary_v2(p_row stories, p_unlocked boolean, p_is_editor boolean, p_scene_count integer, p_prereqs jsonb, p_completed boolean, p_progress jsonb) ============
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
$function$


-- ============ evaluate_unlock_spec_guest_v2(p_spec jsonb, p_ev jsonb) ============
CREATE OR REPLACE FUNCTION public.evaluate_unlock_spec_guest_v2(p_spec jsonb, p_ev jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm jsonb;
  v_check jsonb;
BEGIN
  v_norm := public.normalize_unlock_spec_v2(p_spec);
  v_check := public.validate_unlock_spec_v2(v_norm);
  IF NOT (v_check->>'ok')::boolean THEN RETURN false; END IF;
  RETURN public._eval_unlock_node_guest_v2(v_norm->'expr', 1, COALESCE(p_ev, '{}'::jsonb));
END;
$function$


-- ============ evaluate_unlock_spec_v2(p_user_id uuid, p_spec jsonb) ============
CREATE OR REPLACE FUNCTION public.evaluate_unlock_spec_v2(p_user_id uuid, p_spec jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_norm jsonb;
  v_check jsonb;
  v_expr jsonb;
BEGIN
  v_norm := public.normalize_unlock_spec_v2(p_spec);
  v_check := public.validate_unlock_spec_v2(v_norm);
  IF NOT (v_check->>'ok')::boolean THEN RETURN false; END IF;
  v_expr := v_norm->'expr';

  IF p_user_id IS NULL THEN
    -- Anonymous callers: only unconditional 'always' passes.
    RETURN ((v_expr->>'type') = 'always');
  END IF;

  RETURN public._eval_unlock_node_v2(p_user_id, v_expr, 1);
END;
$function$


-- ============ list_stories_guest_v3(p_world_slug text, p_collection_id text, p_evidence jsonb) ============
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

  WITH base AS (
    SELECT s AS row, s.id AS id, s.display_order AS display_order, s.unlock_spec AS unlock_spec
      FROM public.stories s
     WHERE s.status = 'published'
       AND NOT public.story_is_campaign_intro(s.id, s.metadata, s.tags)
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
$function$


-- ============ list_stories_v2(p_world_slug text) ============
CREATE OR REPLACE FUNCTION public.list_stories_v2(p_world_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.list_stories_v3(p_world_slug, NULL);
$function$


-- ============ list_stories_v3(p_world_slug text, p_collection_id text) ============
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
  WITH base AS (
    SELECT s AS row, s.id AS id, s.display_order AS display_order, s.unlock_spec AS unlock_spec
      FROM public.stories s
     WHERE s.status = 'published'
       AND NOT public.story_is_campaign_intro(s.id, s.metadata, s.tags)
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
$function$


-- ============ normalize_unlock_spec_v2(p_input jsonb) ============
CREATE OR REPLACE FUNCTION public.normalize_unlock_spec_v2(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_expr jsonb;
  v_type text;
  v_children jsonb;
  v_conv jsonb := '[]'::jsonb;
  v_child jsonb;
  v_converted jsonb;
  v_id text;
  v_cid text;
  v_chid text;
  v_ids jsonb;
  v_min int;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) = 'null' THEN
    RETURN jsonb_build_object('version', 2, 'expr', jsonb_build_object('type','always'));
  END IF;

  -- Already in the frozen envelope? Return as-is; caller validates.
  IF jsonb_typeof(p_input) = 'object'
     AND (p_input->>'version') = '2'
     AND p_input ? 'expr' THEN
    RETURN p_input;
  END IF;

  -- Legacy envelope { v: 1|2, rule } → unwrap rule, recurse.
  IF jsonb_typeof(p_input) = 'object'
     AND p_input ? 'rule'
     AND (p_input->>'v') IN ('1','2') THEN
    RETURN public.normalize_unlock_spec_v2(p_input->'rule');
  END IF;

  IF jsonb_typeof(p_input) <> 'object' THEN
    -- fail-closed NEVER (expressed as not(always) in the frozen vocab)
    RETURN jsonb_build_object('version', 2, 'expr',
      jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
  END IF;

  v_type := p_input->>'type';
  IF v_type IS NULL THEN
    RETURN jsonb_build_object('version', 2, 'expr',
      jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
  END IF;

  IF v_type = 'always' THEN
    v_expr := jsonb_build_object('type','always');

  ELSIF v_type = 'never' THEN
    -- Legacy 'never' → not(always).
    v_expr := jsonb_build_object('type','not','child', jsonb_build_object('type','always'));

  ELSIF v_type IN ('and','or','all_of','any_of','all','any') THEN
    v_children := COALESCE(p_input->'of', p_input->'children', '[]'::jsonb);
    IF jsonb_typeof(v_children) <> 'array' OR jsonb_array_length(v_children) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    FOR v_child IN SELECT jsonb_array_elements(v_children) LOOP
      v_converted := public.normalize_unlock_spec_v2(v_child);
      -- Unwrap {version,expr} back to a node.
      v_converted := v_converted->'expr';
      -- If any child collapsed to the fail-closed NEVER (not(always)), the whole group collapses.
      IF (v_converted->>'type') = 'not'
         AND (v_converted->'child'->>'type') = 'always' THEN
        RETURN jsonb_build_object('version', 2, 'expr',
          jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
      END IF;
      v_conv := v_conv || jsonb_build_array(v_converted);
    END LOOP;
    v_expr := jsonb_build_object(
      'type', CASE WHEN v_type IN ('and','all_of','all') THEN 'all' ELSE 'any' END,
      'of', v_conv
    );

  ELSIF v_type = 'not' THEN
    IF NOT (p_input ? 'child') THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_converted := public.normalize_unlock_spec_v2(p_input->'child');
    v_converted := v_converted->'expr';
    v_expr := jsonb_build_object('type','not','child', v_converted);

  ELSIF v_type IN ('story_complete','story_completed') THEN
    v_id := p_input->>'story_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','story_complete','story_id', v_id);

  ELSIF v_type IN ('campaign_complete','campaign_completed') THEN
    v_id := p_input->>'campaign_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','campaign_complete','campaign_id', v_id);

  ELSIF v_type = 'campaign_chapter_complete' THEN
    v_cid := p_input->>'campaign_id';
    v_chid := p_input->>'chapter_id';
    IF v_cid IS NULL OR length(v_cid) = 0 OR v_chid IS NULL OR length(v_chid) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','campaign_chapter_complete',
      'campaign_id', v_cid, 'chapter_id', v_chid);

  ELSIF v_type IN ('investigation_complete','investigation_completed') THEN
    v_id := p_input->>'investigation_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','investigation_complete','investigation_id', v_id);

  ELSIF v_type = 'entity_discovered' THEN
    v_id := p_input->>'entity_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','entity_discovered','entity_id', v_id);

  ELSIF v_type = 'entities_discovered' THEN
    v_ids := p_input->'ids';
    IF v_ids IS NULL OR jsonb_typeof(v_ids) <> 'array' OR jsonb_array_length(v_ids) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    BEGIN
      v_min := (p_input->>'min')::int;
    EXCEPTION WHEN others THEN
      v_min := 0;
    END;
    IF v_min < 1 OR v_min > jsonb_array_length(v_ids) THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','entities_discovered','ids', v_ids, 'min', v_min);

  ELSIF v_type = 'artifact_owned' THEN
    v_id := p_input->>'artifact_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','artifact_owned','artifact_id', v_id);

  ELSIF v_type = 'atlas_location_visited' THEN
    v_id := p_input->>'location_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','atlas_location_visited','location_id', v_id);

  ELSIF v_type IN ('achievement_unlocked','achievement_earned') THEN
    v_id := p_input->>'achievement_id';
    IF v_id IS NULL OR length(v_id) = 0 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','achievement_unlocked','achievement_id', v_id);

  ELSIF v_type = 'player_level' THEN
    BEGIN
      v_min := (p_input->>'min')::int;
    EXCEPTION WHEN others THEN
      v_min := 0;
    END;
    IF v_min < 1 THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','player_level','min', v_min);

  ELSIF v_type = 'date_window' THEN
    IF NOT (p_input ? 'start') AND NOT (p_input ? 'end') THEN
      RETURN jsonb_build_object('version', 2, 'expr',
        jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
    END IF;
    v_expr := jsonb_build_object('type','date_window');
    IF p_input ? 'start' THEN v_expr := v_expr || jsonb_build_object('start', p_input->>'start'); END IF;
    IF p_input ? 'end'   THEN v_expr := v_expr || jsonb_build_object('end',   p_input->>'end');   END IF;

  ELSE
    RETURN jsonb_build_object('version', 2, 'expr',
      jsonb_build_object('type','not','child', jsonb_build_object('type','always')));
  END IF;

  RETURN jsonb_build_object('version', 2, 'expr', v_expr);
END;
$function$


-- ============ story_is_campaign_intro(p_story_id text, p_metadata jsonb, p_tags text[]) ============
CREATE OR REPLACE FUNCTION public.story_is_campaign_intro(p_story_id text, p_metadata jsonb, p_tags text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
       COALESCE(p_metadata->>'kind', '') = 'campaign_intro'
    OR 'campaign-intro' = ANY (COALESCE(p_tags, ARRAY[]::text[]))
    OR EXISTS (
         SELECT 1 FROM public.admin_campaigns c
          WHERE c.data->>'intro_story_id' = p_story_id
       );
$function$


-- ============ validate_unlock_spec_v2(p_input jsonb) ============
CREATE OR REPLACE FUNCTION public.validate_unlock_spec_v2(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_errors jsonb := '[]'::jsonb;
  v_node_count int := 0;
  v_max_depth int := 0;
  v_max_allowed_depth constant int := 6;
  v_max_nodes constant int := 64;
  v_stack jsonb := '[]'::jsonb;
  v_frame jsonb;
  v_node jsonb;
  v_path text;
  v_depth int;
  v_type text;
  v_allowed text[];
  v_key text;
  v_i int;
  v_kids jsonb;
  v_id text;
  v_id_field text;
  v_min_txt text;
  v_min_num numeric;
BEGIN
  IF p_input IS NULL OR jsonb_typeof(p_input) <> 'object' THEN
    v_errors := v_errors || jsonb_build_object('code','not_an_object','path','$','message','Unlock spec must be a JSON object.');
    RETURN jsonb_build_object('ok', false, 'errors', v_errors, 'node_count', 0, 'depth', 0);
  END IF;

  IF (p_input->>'version') IS DISTINCT FROM '2' THEN
    v_errors := v_errors || jsonb_build_object('code','wrong_version','path','$.version','message','Unlock spec version must be 2.');
  END IF;

  IF NOT (p_input ? 'expr') THEN
    v_errors := v_errors || jsonb_build_object('code','missing_expr','path','$.expr','message','Unlock spec is missing expr.');
    RETURN jsonb_build_object('ok', false, 'errors', v_errors, 'node_count', 0, 'depth', 0);
  END IF;

  v_stack := jsonb_build_array(jsonb_build_object('node', p_input->'expr', 'path', '$.expr', 'depth', 1));

  WHILE jsonb_array_length(v_stack) > 0 LOOP
    v_frame := v_stack->-1;
    v_stack := v_stack - (jsonb_array_length(v_stack) - 1);
    v_node := v_frame->'node';
    v_path := v_frame->>'path';
    v_depth := (v_frame->>'depth')::int;
    IF v_depth > v_max_depth THEN v_max_depth := v_depth; END IF;

    IF v_depth > v_max_allowed_depth THEN
      v_errors := v_errors || jsonb_build_object('code','depth_exceeded','path',v_path,
        'message', format('Nesting depth exceeds %s.', v_max_allowed_depth));
      CONTINUE;
    END IF;
    IF jsonb_typeof(v_node) <> 'object' THEN
      v_errors := v_errors || jsonb_build_object('code','not_an_object_node','path',v_path,'message','Node must be a JSON object.');
      CONTINUE;
    END IF;
    v_node_count := v_node_count + 1;
    IF v_node_count > v_max_nodes THEN
      v_errors := v_errors || jsonb_build_object('code','node_count_exceeded','path',v_path,
        'message', format('Node count exceeds %s.', v_max_nodes));
      CONTINUE;
    END IF;

    v_type := v_node->>'type';
    IF v_type IS NULL OR length(v_type) = 0 THEN
      v_errors := v_errors || jsonb_build_object('code','missing_type','path',v_path||'.type','message','Node is missing type.');
      CONTINUE;
    END IF;

    v_allowed := CASE v_type
      WHEN 'all' THEN ARRAY['type','of']
      WHEN 'any' THEN ARRAY['type','of']
      WHEN 'not' THEN ARRAY['type','child']
      WHEN 'always' THEN ARRAY['type']
      WHEN 'campaign_complete' THEN ARRAY['type','campaign_id']
      WHEN 'campaign_chapter_complete' THEN ARRAY['type','campaign_id','chapter_id']
      WHEN 'investigation_complete' THEN ARRAY['type','investigation_id']
      WHEN 'entity_discovered' THEN ARRAY['type','entity_id']
      WHEN 'entities_discovered' THEN ARRAY['type','ids','min']
      WHEN 'artifact_owned' THEN ARRAY['type','artifact_id']
      WHEN 'atlas_location_visited' THEN ARRAY['type','location_id']
      WHEN 'achievement_unlocked' THEN ARRAY['type','achievement_id']
      WHEN 'player_level' THEN ARRAY['type','min']
      WHEN 'story_complete' THEN ARRAY['type','story_id']
      WHEN 'date_window' THEN ARRAY['type','start','end']
      ELSE NULL
    END;
    IF v_allowed IS NULL THEN
      v_errors := v_errors || jsonb_build_object('code','unknown_type','path',v_path||'.type',
        'message', format('Unknown node type %L.', v_type));
      CONTINUE;
    END IF;

    FOR v_key IN SELECT jsonb_object_keys(v_node) LOOP
      IF NOT (v_key = ANY(v_allowed)) THEN
        v_errors := v_errors || jsonb_build_object('code','extra_fields','path',v_path||'.'||v_key,
          'message', format('Field %L is not allowed on %L nodes.', v_key, v_type));
      END IF;
    END LOOP;

    IF v_type IN ('all','any') THEN
      IF NOT (v_node ? 'of') THEN
        v_errors := v_errors || jsonb_build_object('code','missing_of','path',v_path||'.of',
          'message', format('%L requires of.', v_type));
        CONTINUE;
      END IF;
      v_kids := v_node->'of';
      IF jsonb_typeof(v_kids) <> 'array' THEN
        v_errors := v_errors || jsonb_build_object('code','of_not_array','path',v_path||'.of',
          'message', format('%L.of must be an array.', v_type));
        CONTINUE;
      END IF;
      IF jsonb_array_length(v_kids) = 0 THEN
        v_errors := v_errors || jsonb_build_object('code','empty_of_forbidden','path',v_path||'.of',
          'message', format('%L.of must not be empty.', v_type));
        CONTINUE;
      END IF;
      FOR v_i IN 0..jsonb_array_length(v_kids) - 1 LOOP
        v_stack := v_stack || jsonb_build_array(jsonb_build_object(
          'node', v_kids->v_i,
          'path', v_path||'.of['||v_i||']',
          'depth', v_depth + 1
        ));
      END LOOP;

    ELSIF v_type = 'not' THEN
      IF NOT (v_node ? 'child') THEN
        v_errors := v_errors || jsonb_build_object('code','missing_child','path',v_path||'.child','message','not requires child.');
        CONTINUE;
      END IF;
      v_stack := v_stack || jsonb_build_array(jsonb_build_object(
        'node', v_node->'child',
        'path', v_path||'.child',
        'depth', v_depth + 1
      ));

    ELSIF v_type IN ('story_complete','campaign_complete','investigation_complete',
                     'entity_discovered','artifact_owned','atlas_location_visited','achievement_unlocked') THEN
      v_id_field := CASE v_type
        WHEN 'story_complete' THEN 'story_id'
        WHEN 'campaign_complete' THEN 'campaign_id'
        WHEN 'investigation_complete' THEN 'investigation_id'
        WHEN 'entity_discovered' THEN 'entity_id'
        WHEN 'artifact_owned' THEN 'artifact_id'
        WHEN 'atlas_location_visited' THEN 'location_id'
        WHEN 'achievement_unlocked' THEN 'achievement_id'
      END;
      IF NOT (v_node ? v_id_field) THEN
        v_errors := v_errors || jsonb_build_object('code','missing_id_field','path',v_path||'.'||v_id_field,
          'message', format('%L requires %L.', v_type, v_id_field));
        CONTINUE;
      END IF;
      IF jsonb_typeof(v_node->v_id_field) <> 'string' THEN
        v_errors := v_errors || jsonb_build_object('code','id_not_string','path',v_path||'.'||v_id_field,
          'message', format('%L must be a string.', v_id_field));
        CONTINUE;
      END IF;
      v_id := v_node->>v_id_field;
      IF length(btrim(v_id)) = 0 THEN
        v_errors := v_errors || jsonb_build_object('code','id_empty','path',v_path||'.'||v_id_field,
          'message', format('%L must not be empty.', v_id_field));
      END IF;

    ELSIF v_type = 'campaign_chapter_complete' THEN
      FOREACH v_id_field IN ARRAY ARRAY['campaign_id','chapter_id'] LOOP
        IF NOT (v_node ? v_id_field) THEN
          v_errors := v_errors || jsonb_build_object('code','missing_id_field','path',v_path||'.'||v_id_field,
            'message', format('campaign_chapter_complete requires %L.', v_id_field));
        ELSIF jsonb_typeof(v_node->v_id_field) <> 'string' THEN
          v_errors := v_errors || jsonb_build_object('code','id_not_string','path',v_path||'.'||v_id_field,
            'message', format('%L must be a string.', v_id_field));
        ELSIF length(btrim(v_node->>v_id_field)) = 0 THEN
          v_errors := v_errors || jsonb_build_object('code','id_empty','path',v_path||'.'||v_id_field,
            'message', format('%L must not be empty.', v_id_field));
        END IF;
      END LOOP;

    ELSIF v_type = 'entities_discovered' THEN
      IF NOT (v_node ? 'ids') OR jsonb_typeof(v_node->'ids') <> 'array' THEN
        v_errors := v_errors || jsonb_build_object('code','ids_not_array','path',v_path||'.ids','message','ids must be an array.');
      ELSE
        IF jsonb_array_length(v_node->'ids') = 0 THEN
          v_errors := v_errors || jsonb_build_object('code','ids_empty','path',v_path||'.ids','message','ids must not be empty.');
        END IF;
        FOR v_i IN 0..GREATEST(jsonb_array_length(v_node->'ids') - 1, -1) LOOP
          EXIT WHEN jsonb_array_length(v_node->'ids') = 0;
          IF jsonb_typeof((v_node->'ids')->v_i) <> 'string'
             OR length(btrim((v_node->'ids')->>v_i)) = 0 THEN
            v_errors := v_errors || jsonb_build_object('code','ids_item_not_string',
              'path', v_path||'.ids['||v_i||']', 'message','ids item must be a non-empty string.');
          END IF;
        END LOOP;
      END IF;
      IF NOT (v_node ? 'min') THEN
        v_errors := v_errors || jsonb_build_object('code','missing_id_field','path',v_path||'.min','message','entities_discovered requires min.');
      ELSE
        v_min_txt := v_node->>'min';
        BEGIN
          v_min_num := v_min_txt::numeric;
          IF v_min_num <> trunc(v_min_num) THEN
            v_errors := v_errors || jsonb_build_object('code','min_not_integer','path',v_path||'.min','message','min must be an integer.');
          ELSIF v_min_num < 1
                OR (jsonb_typeof(v_node->'ids') = 'array'
                    AND v_min_num > jsonb_array_length(v_node->'ids')) THEN
            v_errors := v_errors || jsonb_build_object('code','min_out_of_range','path',v_path||'.min','message','min must be between 1 and ids.length.');
          END IF;
        EXCEPTION WHEN others THEN
          v_errors := v_errors || jsonb_build_object('code','min_not_integer','path',v_path||'.min','message','min must be an integer.');
        END;
      END IF;

    ELSIF v_type = 'player_level' THEN
      IF NOT (v_node ? 'min') THEN
        v_errors := v_errors || jsonb_build_object('code','missing_id_field','path',v_path||'.min','message','player_level requires min.');
      ELSE
        v_min_txt := v_node->>'min';
        BEGIN
          v_min_num := v_min_txt::numeric;
          IF v_min_num <> trunc(v_min_num) THEN
            v_errors := v_errors || jsonb_build_object('code','min_not_integer','path',v_path||'.min','message','min must be an integer.');
          ELSIF v_min_num < 1 THEN
            v_errors := v_errors || jsonb_build_object('code','min_out_of_range','path',v_path||'.min','message','min must be >= 1.');
          END IF;
        EXCEPTION WHEN others THEN
          v_errors := v_errors || jsonb_build_object('code','min_not_integer','path',v_path||'.min','message','min must be an integer.');
        END;
      END IF;

    ELSIF v_type = 'date_window' THEN
      IF NOT (v_node ? 'start') AND NOT (v_node ? 'end') THEN
        v_errors := v_errors || jsonb_build_object('code','date_window_empty','path',v_path,'message','date_window requires start and/or end.');
      ELSE
        IF v_node ? 'start' AND jsonb_typeof(v_node->'start') <> 'string' THEN
          v_errors := v_errors || jsonb_build_object('code','date_not_string','path',v_path||'.start','message','start must be an ISO date string.');
        END IF;
        IF v_node ? 'end' AND jsonb_typeof(v_node->'end') <> 'string' THEN
          v_errors := v_errors || jsonb_build_object('code','date_not_string','path',v_path||'.end','message','end must be an ISO date string.');
        END IF;
      END IF;
    END IF;
    -- always: no further checks.
  END LOOP;

  RETURN jsonb_build_object(
    'ok', (jsonb_array_length(v_errors) = 0),
    'errors', v_errors,
    'node_count', v_node_count,
    'depth', v_max_depth
  );
END;
$function$


