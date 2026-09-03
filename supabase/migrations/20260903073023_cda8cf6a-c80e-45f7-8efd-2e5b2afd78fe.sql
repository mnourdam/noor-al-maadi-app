-- Phase 2b: precompute unlock-spec normalization/validation/leaves at write time.

CREATE TABLE IF NOT EXISTS public.story_unlock_norm_v2 (
  story_id   text PRIMARY KEY REFERENCES public.stories(id) ON DELETE CASCADE,
  spec       jsonb,
  norm_expr  jsonb,
  is_valid   boolean NOT NULL DEFAULT false,
  leaves     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.story_unlock_norm_v2 TO service_role;
ALTER TABLE public.story_unlock_norm_v2 ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: this is an internal read-model consumed exclusively by
-- SECURITY DEFINER story-list functions. No client role reads it directly.

COMMENT ON TABLE public.story_unlock_norm_v2 IS
  'Phase 2b internal cache: normalized unlock expr, validity and prerequisite leaves per story. Maintained by trigger on public.stories; consumers verify spec equality before trusting a row.';

CREATE OR REPLACE FUNCTION public._story_unlock_leaves_v2(p_expr jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH RECURSIVE walk(node, depth) AS (
    SELECT p_expr, 1
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
    SELECT 'entity_discovered', node->>'entity_id'
      FROM walk
     WHERE node->>'type' = 'entity_discovered'
    UNION ALL
    SELECT 'entity_discovered', jsonb_array_elements_text(COALESCE(node->'entity_ids','[]'::jsonb))
      FROM walk
     WHERE node->>'type' = 'entities_discovered'
  )
  SELECT COALESCE(
           (SELECT jsonb_agg(jsonb_build_object('kind', l.kind, 'ref', l.ref) ORDER BY l.kind, l.ref)
              FROM (SELECT DISTINCT kind, ref FROM leaves WHERE ref IS NOT NULL) l),
           '[]'::jsonb);
$function$;

CREATE OR REPLACE FUNCTION public._story_unlock_norm_sync_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_norm jsonb;
BEGIN
  v_norm := public.normalize_unlock_spec_v2(NEW.unlock_spec);

  INSERT INTO public.story_unlock_norm_v2 (story_id, spec, norm_expr, is_valid, leaves, updated_at)
  VALUES (
    NEW.id,
    NEW.unlock_spec,
    v_norm->'expr',
    COALESCE((public.validate_unlock_spec_v2(v_norm)->>'ok')::boolean, false),
    CASE WHEN NEW.unlock_spec IS NULL THEN '[]'::jsonb
         ELSE public._story_unlock_leaves_v2(v_norm->'expr') END,
    now()
  )
  ON CONFLICT (story_id) DO UPDATE
    SET spec = EXCLUDED.spec,
        norm_expr = EXCLUDED.norm_expr,
        is_valid = EXCLUDED.is_valid,
        leaves = EXCLUDED.leaves,
        updated_at = now();

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_story_unlock_norm_sync_v2 ON public.stories;
CREATE TRIGGER trg_story_unlock_norm_sync_v2
AFTER INSERT OR UPDATE OF unlock_spec, id ON public.stories
FOR EACH ROW EXECUTE FUNCTION public._story_unlock_norm_sync_v2();

-- Backfill
INSERT INTO public.story_unlock_norm_v2 (story_id, spec, norm_expr, is_valid, leaves, updated_at)
SELECT s.id,
       s.unlock_spec,
       n.norm->'expr',
       COALESCE((public.validate_unlock_spec_v2(n.norm)->>'ok')::boolean, false),
       CASE WHEN s.unlock_spec IS NULL THEN '[]'::jsonb
            ELSE public._story_unlock_leaves_v2(n.norm->'expr') END,
       now()
  FROM public.stories s
  CROSS JOIN LATERAL (SELECT public.normalize_unlock_spec_v2(s.unlock_spec) AS norm) n
ON CONFLICT (story_id) DO UPDATE
  SET spec = EXCLUDED.spec,
      norm_expr = EXCLUDED.norm_expr,
      is_valid = EXCLUDED.is_valid,
      leaves = EXCLUDED.leaves,
      updated_at = now();

-- Prepared evaluators (skip per-read normalize/validate)
CREATE OR REPLACE FUNCTION public._eval_unlock_prepared_v2(p_user_id uuid, p_expr jsonb, p_valid boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(p_valid, false) THEN RETURN false; END IF;
  IF p_user_id IS NULL THEN RETURN ((p_expr->>'type') = 'always'); END IF;
  RETURN public._eval_unlock_node_v2(p_user_id, p_expr, 1);
END;
$function$;

CREATE OR REPLACE FUNCTION public._eval_unlock_prepared_guest_v2(p_expr jsonb, p_valid boolean, p_ev jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT COALESCE(p_valid, false) THEN RETURN false; END IF;
  RETURN public._eval_unlock_node_guest_v2(p_expr, 1, COALESCE(p_ev, '{}'::jsonb));
END;
$function$;

-- list_stories_v3: set-wise prerequisite resolution, one normalization per story per write
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
  prep AS (
    SELECT b.row, b.id, b.display_order, b.unlock_spec,
           (c.story_id IS NOT NULL AND c.spec IS NOT DISTINCT FROM b.unlock_spec) AS hit,
           c.norm_expr, c.is_valid, c.leaves
      FROM base b
      LEFT JOIN public.story_unlock_norm_v2 c ON c.story_id = b.id
  ),
  scene_counts AS (
    SELECT sc.story_id, count(*)::int AS n
      FROM public.story_scenes sc
     WHERE sc.story_id IN (SELECT id FROM base)
     GROUP BY sc.story_id
  ),
  leaf_rows AS (
    SELECT DISTINCT p.id AS story_id, l->>'kind' AS kind, l->>'ref' AS ref
      FROM prep p
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.leaves, '[]'::jsonb)) l
     WHERE p.hit
  ),
  refs AS (
    SELECT DISTINCT lr.kind, lr.ref, public._uuid_or_null_v2(lr.ref) AS ref_uuid
      FROM leaf_rows lr
  ),
  resolved AS (
    SELECT r.kind, r.ref,
           CASE r.kind
             WHEN 'campaign_complete'      THEN COALESCE(
               (SELECT ac.title FROM public.admin_campaigns ac WHERE ac.id = r.ref), r.ref)
             WHEN 'investigation_complete' THEN COALESCE(
               (SELECT inv.title FROM public.investigations inv WHERE inv.id = r.ref_uuid), r.ref)
             WHEN 'story_complete'         THEN COALESCE(
               (SELECT stp.title_ar FROM public.stories stp WHERE stp.id = r.ref), r.ref)
             WHEN 'entity_discovered'      THEN COALESCE(
               (SELECT ent.title FROM public.encyclopedia_entities ent WHERE ent.id = r.ref_uuid), r.ref)
           END AS title,
           CASE
             WHEN v_uid IS NULL THEN false
             WHEN r.kind = 'campaign_complete' THEN EXISTS (
               SELECT 1 FROM public.user_campaign_completions ucc
                WHERE ucc.user_id = v_uid AND ucc.campaign_id = r.ref)
             WHEN r.kind = 'investigation_complete' THEN EXISTS (
               SELECT 1 FROM public.user_investigation_progress uip
                WHERE uip.user_id = v_uid AND uip.investigation_id = r.ref_uuid
                  AND uip.completed_at IS NOT NULL)
             WHEN r.kind = 'story_complete' THEN EXISTS (
               SELECT 1 FROM public.user_story_completions usc
                WHERE usc.user_id = v_uid AND usc.story_id = r.ref)
             WHEN r.kind = 'entity_discovered' THEN EXISTS (
               SELECT 1 FROM public.user_entity_discoveries ued
                WHERE ued.user_id = v_uid AND ued.entity_id = r.ref_uuid)
             ELSE false
           END AS satisfied
      FROM refs r
  ),
  prereq_json AS (
    SELECT lr.story_id,
           jsonb_agg(
             jsonb_build_object(
               'kind', CASE res.kind
                         WHEN 'campaign_complete'      THEN 'campaign_completed'
                         WHEN 'investigation_complete' THEN 'investigation_completed'
                         WHEN 'story_complete'         THEN 'story_completed'
                         WHEN 'entity_discovered'      THEN 'entity_discovered'
                       END,
               'ref', res.ref,
               'title', res.title,
               'satisfied', res.satisfied
             ) ORDER BY res.kind, res.ref
           ) AS js
      FROM leaf_rows lr
      JOIN resolved res ON res.kind = lr.kind AND res.ref = lr.ref
     GROUP BY lr.story_id
  ),
  enriched AS (
    SELECT
      p.row AS row,
      p.id AS id,
      p.display_order AS display_order,
      COALESCE(sc.n, 0) AS scene_count,
      CASE WHEN p.hit THEN public._eval_unlock_prepared_v2(v_uid, p.norm_expr, p.is_valid)
           ELSE public.evaluate_unlock_spec_v2(v_uid, p.unlock_spec) END AS unlocked,
      CASE WHEN p.hit THEN COALESCE(pj.js, '[]'::jsonb)
           ELSE public._story_prereqs_v2(v_uid, p.unlock_spec) END AS prereqs,
      CASE
        WHEN v_uid IS NULL THEN false
        ELSE EXISTS (
          SELECT 1 FROM public.user_story_completions c
           WHERE c.user_id = v_uid AND c.story_id = p.id
        )
      END AS completed,
      CASE
        WHEN v_uid IS NULL THEN NULL
        ELSE (
          SELECT jsonb_build_object(
            'last_scene_index', up.last_scene_index,
            'max_scene_index_reached', up.max_scene_index_reached
          )
            FROM public.user_story_progress up
           WHERE up.user_id = v_uid AND up.story_id = p.id
        )
      END AS progress
    FROM prep p
    LEFT JOIN scene_counts sc ON sc.story_id = p.id
    LEFT JOIN prereq_json pj ON pj.story_id = p.id
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
  prep AS (
    SELECT b.row, b.id, b.display_order, b.unlock_spec,
           (c.story_id IS NOT NULL AND c.spec IS NOT DISTINCT FROM b.unlock_spec) AS hit,
           c.norm_expr, c.is_valid, c.leaves
      FROM base b
      LEFT JOIN public.story_unlock_norm_v2 c ON c.story_id = b.id
  ),
  scene_counts AS (
    SELECT sc.story_id, count(*)::int AS n
      FROM public.story_scenes sc
     WHERE sc.story_id IN (SELECT id FROM base)
     GROUP BY sc.story_id
  ),
  leaf_rows AS (
    SELECT DISTINCT p.id AS story_id, l->>'kind' AS kind, l->>'ref' AS ref
      FROM prep p
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.leaves, '[]'::jsonb)) l
     WHERE p.hit
  ),
  refs AS (
    SELECT DISTINCT lr.kind, lr.ref, public._uuid_or_null_v2(lr.ref) AS ref_uuid
      FROM leaf_rows lr
  ),
  resolved AS (
    SELECT r.kind, r.ref,
           CASE r.kind
             WHEN 'campaign_complete'      THEN COALESCE(
               (SELECT ac.title FROM public.admin_campaigns ac WHERE ac.id = r.ref), r.ref)
             WHEN 'investigation_complete' THEN COALESCE(
               (SELECT inv.title FROM public.investigations inv WHERE inv.id = r.ref_uuid), r.ref)
             WHEN 'story_complete'         THEN COALESCE(
               (SELECT stp.title_ar FROM public.stories stp WHERE stp.id = r.ref), r.ref)
             WHEN 'entity_discovered'      THEN COALESCE(
               (SELECT ent.title FROM public.encyclopedia_entities ent WHERE ent.id = r.ref_uuid), r.ref)
           END AS title,
           false AS satisfied
      FROM refs r
  ),
  prereq_json AS (
    SELECT lr.story_id,
           jsonb_agg(
             jsonb_build_object(
               'kind', CASE res.kind
                         WHEN 'campaign_complete'      THEN 'campaign_completed'
                         WHEN 'investigation_complete' THEN 'investigation_completed'
                         WHEN 'story_complete'         THEN 'story_completed'
                         WHEN 'entity_discovered'      THEN 'entity_discovered'
                       END,
               'ref', res.ref,
               'title', res.title,
               'satisfied', res.satisfied
             ) ORDER BY res.kind, res.ref
           ) AS js
      FROM leaf_rows lr
      JOIN resolved res ON res.kind = lr.kind AND res.ref = lr.ref
     GROUP BY lr.story_id
  ),
  enriched AS (
    SELECT p.row AS row, p.id AS id, p.display_order AS display_order,
           COALESCE(sc.n, 0) AS scene_count,
           CASE WHEN p.hit THEN public._eval_unlock_prepared_guest_v2(p.norm_expr, p.is_valid, p_evidence)
                ELSE public.evaluate_unlock_spec_guest_v2(p.unlock_spec, p_evidence) END AS unlocked,
           CASE WHEN p.hit THEN COALESCE(pj.js, '[]'::jsonb)
                ELSE public._story_prereqs_v2(NULL, p.unlock_spec) END AS prereqs
      FROM prep p
      LEFT JOIN scene_counts sc ON sc.story_id = p.id
      LEFT JOIN prereq_json pj ON pj.story_id = p.id
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