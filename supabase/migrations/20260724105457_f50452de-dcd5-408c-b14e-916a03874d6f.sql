
-- =====================================================================
-- M6 — Stories Player Read Layer (RPCs only)
-- Additive. No schema, enum, table, or policy changes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Internal: normalize a story row into either a "full" or a "redacted"
-- JSON summary based on unlock state + lock_visibility. Returns NULL
-- when the row must be omitted entirely (hidden + locked, non-editor).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._story_redact_summary_v2(
  p_row       public.stories,
  p_unlocked  boolean,
  p_is_editor boolean,
  p_scene_count int,
  p_prereqs   jsonb,
  p_completed boolean,
  p_progress  jsonb
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
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

  -- Locked path
  IF v_lv = 'hidden' THEN
    RETURN NULL;  -- omit
  ELSIF v_lv = 'mystery' THEN
    RETURN jsonb_build_object(
      'id', p_row.id,
      'slug', p_row.slug,
      'is_locked', true,
      'lock_visibility', 'mystery',
      'is_redacted', true
    );
  ELSE
    -- 'visible' locked: return full metadata sans unlock_spec, with prereqs
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
$$;

-- ---------------------------------------------------------------------
-- Internal: extract & resolve prereq leaves from a normalized v2 expr.
-- Handles all/any (of[]), not (child), and the three prereq leaf kinds
-- (campaign_complete, investigation_complete, story_complete). Other
-- leaf kinds evaluate correctly via _eval_unlock_node_v2 but are not
-- surfaced as prereq chips.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._story_prereqs_v2(
  p_uid uuid,
  p_spec jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
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
  ),
  resolved AS (
    SELECT DISTINCT l.kind, l.ref,
           CASE l.kind
             WHEN 'campaign_complete'      THEN COALESCE(ac.title, l.ref)
             WHEN 'investigation_complete' THEN COALESCE(inv.title, l.ref)
             WHEN 'story_complete'         THEN COALESCE(stp.title_ar, l.ref)
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
             ELSE false
           END AS satisfied
      FROM leaves l
      LEFT JOIN public.admin_campaigns ac ON ac.id = l.ref
      LEFT JOIN public.investigations inv ON inv.id::text = l.ref
      LEFT JOIN public.stories       stp ON stp.id = l.ref
     WHERE l.ref IS NOT NULL
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             -- Emit legacy _ed suffix so existing UI keeps rendering.
             'kind', CASE kind
                       WHEN 'campaign_complete'      THEN 'campaign_completed'
                       WHEN 'investigation_complete' THEN 'investigation_completed'
                       WHEN 'story_complete'         THEN 'story_completed'
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
$$;

-- ---------------------------------------------------------------------
-- list_stories_v3(p_world_slug, p_collection_id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_stories_v3(
  p_world_slug   text DEFAULT NULL,
  p_collection_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_editor boolean := false;
  v_out jsonb;
BEGIN
  IF v_uid IS NOT NULL THEN
    BEGIN
      v_is_editor := public.is_content_editor();
    EXCEPTION WHEN others THEN
      v_is_editor := public.has_role(v_uid, 'admin');
    END;
  END IF;

  WITH base AS (
    SELECT s.*
      FROM public.stories s
     WHERE (v_is_editor OR s.status = 'published')
       AND (p_world_slug   IS NULL OR s.world_slug = p_world_slug)
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
      b.*,
      COALESCE(sc.n, 0) AS scene_count,
      CASE
        WHEN v_uid IS NULL THEN
          ((b.unlock_spec->>'type') IS NULL OR (b.unlock_spec->>'type') = 'always'
           OR public.evaluate_unlock_spec_v2(NULL, b.unlock_spec))
        ELSE public.evaluate_unlock_spec_v2(v_uid, b.unlock_spec)
      END AS unlocked,
      public._story_prereqs_v2(v_uid, b.unlock_spec) AS prereqs,
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
    LEFT JOIN scene_counts sc ON sc.story_id = b.id
  ),
  redacted AS (
    SELECT public._story_redact_summary_v2(
             e::public.stories, e.unlocked, v_is_editor,
             e.scene_count, e.prereqs, e.completed, e.progress
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
$$;

-- ---------------------------------------------------------------------
-- list_stories_v2 — compatibility wrapper over v3.
-- Existing signature (p_world_slug text) preserved.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_stories_v2(
  p_world_slug text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.list_stories_v3(p_world_slug, NULL);
$$;

-- ---------------------------------------------------------------------
-- get_story_bundle_v2(p_story_id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_story_bundle_v2(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_story public.stories%ROWTYPE;
  v_is_editor boolean := false;
  v_unlocked boolean := false;
  v_lv text;
  v_prereqs jsonb;
BEGIN
  SELECT * INTO v_story FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_uid IS NOT NULL THEN
    BEGIN v_is_editor := public.is_content_editor();
    EXCEPTION WHEN others THEN v_is_editor := public.has_role(v_uid, 'admin');
    END;
  END IF;

  IF v_story.status <> 'published' AND NOT v_is_editor THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_uid IS NULL THEN
    v_unlocked := (v_story.unlock_spec->>'type') IS NULL
               OR (v_story.unlock_spec->>'type') = 'always'
               OR public.evaluate_unlock_spec_v2(NULL, v_story.unlock_spec);
  ELSE
    v_unlocked := public.evaluate_unlock_spec_v2(v_uid, v_story.unlock_spec);
  END IF;

  IF v_is_editor OR v_unlocked THEN
    RETURN jsonb_build_object(
      'ok', true,
      'story', to_jsonb(v_story),
      'scenes', COALESCE((
        SELECT jsonb_agg(to_jsonb(sc) ORDER BY sc.scene_index)
          FROM public.story_scenes sc
         WHERE sc.story_id = v_story.id
      ), '[]'::jsonb),
      'progress', (
        SELECT to_jsonb(p) FROM public.user_story_progress p
         WHERE p.user_id = v_uid AND p.story_id = v_story.id
      ),
      'completed', (v_uid IS NOT NULL) AND EXISTS (
        SELECT 1 FROM public.user_story_completions c
         WHERE c.user_id = v_uid AND c.story_id = v_story.id
      )
    );
  END IF;

  -- Locked branch
  v_lv := COALESCE(v_story.lock_visibility::text, 'visible');
  IF v_lv = 'hidden' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  ELSIF v_lv = 'mystery' THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'locked',
      'story', jsonb_build_object(
        'id', v_story.id, 'slug', v_story.slug,
        'is_locked', true, 'lock_visibility', 'mystery', 'is_redacted', true
      )
    );
  ELSE
    v_prereqs := public._story_prereqs_v2(v_uid, v_story.unlock_spec);
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'locked',
      'story', (to_jsonb(v_story) - 'unlock_spec')
                || jsonb_build_object('is_locked', true, 'is_redacted', false),
      'prereqs', v_prereqs
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- get_story_media_urls_v2(p_story_id)
-- Returns media rows only when the caller may view the story.
-- The client resolves signed URLs from the returned bucket/path.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_story_media_urls_v2(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_story public.stories%ROWTYPE;
  v_is_editor boolean := false;
  v_unlocked boolean := false;
  v_media jsonb;
BEGIN
  SELECT * INTO v_story FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found', 'media', '[]'::jsonb);
  END IF;

  IF v_uid IS NOT NULL THEN
    BEGIN v_is_editor := public.is_content_editor();
    EXCEPTION WHEN others THEN v_is_editor := public.has_role(v_uid, 'admin');
    END;
  END IF;

  IF v_story.status <> 'published' AND NOT v_is_editor THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found', 'media', '[]'::jsonb);
  END IF;

  IF v_uid IS NULL THEN
    v_unlocked := (v_story.unlock_spec->>'type') IS NULL
               OR (v_story.unlock_spec->>'type') = 'always'
               OR public.evaluate_unlock_spec_v2(NULL, v_story.unlock_spec);
  ELSE
    v_unlocked := public.evaluate_unlock_spec_v2(v_uid, v_story.unlock_spec);
  END IF;

  IF NOT (v_is_editor OR v_unlocked) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked', 'media', '[]'::jsonb);
  END IF;

  WITH referenced AS (
    SELECT v_story.cover_media_id AS mid WHERE v_story.cover_media_id IS NOT NULL
    UNION
    SELECT sc.primary_media_id
      FROM public.story_scenes sc
     WHERE sc.story_id = v_story.id AND sc.primary_media_id IS NOT NULL
  ),
  owned AS (
    SELECT m.* FROM public.story_media m WHERE m.story_id = v_story.id
  ),
  extra AS (
    SELECT m.* FROM public.story_media m
      JOIN referenced r ON r.mid = m.id
     WHERE m.story_id IS DISTINCT FROM v_story.id
  ),
  all_media AS (
    SELECT * FROM owned UNION SELECT * FROM extra
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.id), '[]'::jsonb)
    INTO v_media
    FROM all_media a;

  RETURN jsonb_build_object('ok', true, 'media', v_media);
END;
$$;

-- ---------------------------------------------------------------------
-- list_story_collections_v2()
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_story_collections_v2()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_out jsonb;
BEGIN
  WITH visible_counts AS (
    SELECT s.story_collection_id AS cid, count(*)::int AS n
      FROM public.stories s
     WHERE s.status = 'published'
       AND s.story_collection_id IS NOT NULL
       AND COALESCE(s.lock_visibility::text, 'visible') <> 'hidden'
     GROUP BY s.story_collection_id
  )
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id', c.id, 'slug', c.slug,
             'title_ar', c.title_ar, 'title_en', c.title_en,
             'summary_ar', c.summary_ar, 'summary_en', c.summary_en,
             'cover_media_id', c.cover_media_id,
             'display_order', c.display_order,
             'story_count', COALESCE(vc.n, 0)
           ) ORDER BY c.display_order, c.id
         ), '[]'::jsonb)
    INTO v_out
    FROM public.story_collections c
    LEFT JOIN visible_counts vc ON vc.cid = c.id;
  RETURN v_out;
END;
$$;

-- ---------------------------------------------------------------------
-- get_story_collection_v2(p_collection_id)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_story_collection_v2(p_collection_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_col public.story_collections%ROWTYPE;
  v_stories jsonb;
BEGIN
  SELECT * INTO v_col FROM public.story_collections WHERE id = p_collection_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  v_stories := public.list_stories_v3(NULL, p_collection_id);

  RETURN jsonb_build_object(
    'ok', true,
    'collection', to_jsonb(v_col),
    'stories', v_stories
  );
END;
$$;

-- ---------------------------------------------------------------------
-- Grants (SECURITY DEFINER already grants execute to PUBLIC by default,
-- but be explicit to match project conventions).
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.list_stories_v3(text, text)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_stories_v2(text)                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_story_bundle_v2(text)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_story_media_urls_v2(text)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_story_collections_v2()             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_story_collection_v2(text)           TO anon, authenticated;
