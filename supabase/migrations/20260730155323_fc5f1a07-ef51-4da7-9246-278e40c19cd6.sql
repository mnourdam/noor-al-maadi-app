-- Preserve the frozen v2 story importer as internal cores, then add a
-- campaign-intro contract layer around preview/apply.
ALTER FUNCTION public.admin_import_stories_v2_preview(jsonb, jsonb)
  RENAME TO _admin_import_stories_v2_preview_core;
ALTER FUNCTION public.admin_import_stories_v2_apply(jsonb, jsonb)
  RENAME TO _admin_import_stories_v2_apply_core;

REVOKE ALL ON FUNCTION public._admin_import_stories_v2_preview_core(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._admin_import_stories_v2_apply_core(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._admin_import_stories_v2_preview_core(jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._admin_import_stories_v2_apply_core(jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public._story_intro_import_issues(
  p_payload jsonb,
  p_options jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_story jsonb;
  v_story_id text;
  v_campaign_ref text;
  v_campaign_id text;
  v_linked_story_id text;
  v_allow_replace boolean := COALESCE((p_options->>'allow_intro_replace')::boolean, false);
  v_issues jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR v_story IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_payload->'stories', '[]'::jsonb))
  LOOP
    IF COALESCE(v_story#>>'{metadata,kind}', '') = 'campaign_intro'
       OR COALESCE(v_story->'tags', '[]'::jsonb) ? 'campaign-intro' THEN
      v_story_id := NULLIF(btrim(v_story->>'id'), '');
      v_campaign_ref := NULLIF(btrim(v_story#>>'{metadata,campaign_id}'), '');
      v_campaign_id := NULL;
      v_linked_story_id := NULL;

      IF v_campaign_ref IS NULL THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'story_id', v_story_id,
          'code', 'missing_campaign_id'
        ));
        CONTINUE;
      END IF;

      SELECT c.id, NULLIF(c.data->>'intro_story_id', '')
        INTO v_campaign_id, v_linked_story_id
      FROM public.admin_campaigns c
      WHERE c.id = v_campaign_ref OR c.slug = v_campaign_ref
      ORDER BY CASE WHEN c.id = v_campaign_ref THEN 0 ELSE 1 END
      LIMIT 1;

      IF v_campaign_id IS NULL THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'story_id', v_story_id,
          'campaign_id', v_campaign_ref,
          'code', 'unknown_campaign'
        ));
      ELSIF v_linked_story_id IS NOT NULL
            AND v_linked_story_id <> v_story_id
            AND NOT v_allow_replace THEN
        v_issues := v_issues || jsonb_build_array(jsonb_build_object(
          'story_id', v_story_id,
          'campaign_id', v_campaign_id,
          'existing_story_id', v_linked_story_id,
          'code', 'duplicate_published_intro'
        ));
      END IF;
    END IF;
  END LOOP;

  RETURN v_issues;
END;
$$;

REVOKE ALL ON FUNCTION public._story_intro_import_issues(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._story_intro_import_issues(jsonb, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_import_stories_v2_preview(
  p_payload jsonb,
  p_options jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report jsonb;
  v_issues jsonb;
  v_issue jsonb;
  v_story_id text;
  v_old_kind text;
  v_items jsonb;
  v_totals jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_report := public._admin_import_stories_v2_preview_core(p_payload, p_options);
  v_issues := public._story_intro_import_issues(p_payload, p_options);

  IF jsonb_array_length(v_issues) = 0 THEN
    RETURN v_report || jsonb_build_object('intro_link_issues', '[]'::jsonb);
  END IF;

  v_items := COALESCE(v_report->'items', '[]'::jsonb);
  v_totals := COALESCE(v_report->'totals', '{}'::jsonb);

  FOR v_issue IN SELECT value FROM jsonb_array_elements(v_issues)
  LOOP
    v_story_id := v_issue->>'story_id';
    SELECT item->>'kind' INTO v_old_kind
    FROM jsonb_array_elements(v_items) item
    WHERE item->>'id' = v_story_id
    LIMIT 1;

    IF v_old_kind IS NOT NULL AND v_old_kind <> 'invalid' THEN
      v_totals := jsonb_set(
        v_totals,
        ARRAY[v_old_kind],
        to_jsonb(GREATEST(0, COALESCE((v_totals->>v_old_kind)::int, 0) - 1))
      );
      v_totals := jsonb_set(
        v_totals,
        ARRAY['invalid'],
        to_jsonb(COALESCE((v_totals->>'invalid')::int, 0) + 1)
      );
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(
    CASE
      WHEN EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_issues) issue
        WHERE issue->>'story_id' = item->>'id'
      ) THEN jsonb_set(
        jsonb_set(item, '{kind}', '"invalid"'::jsonb),
        '{issues}',
        COALESCE(item->'issues', '[]'::jsonb) || (
          SELECT jsonb_agg(issue)
          FROM jsonb_array_elements(v_issues) issue
          WHERE issue->>'story_id' = item->>'id'
        )
      )
      ELSE item
    END
  ), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(v_items) item;

  RETURN v_report
    || jsonb_build_object(
      'ok', false,
      'items', v_items,
      'totals', v_totals,
      'intro_link_issues', v_issues
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_import_stories_v2_apply(
  p_payload jsonb,
  p_options jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview jsonb;
  v_result jsonb;
  v_story jsonb;
  v_story_id text;
  v_campaign_ref text;
  v_campaign_id text;
  v_old_story_id text;
  v_old_version integer;
  v_requested_version integer;
  v_new_version integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_content_editor() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  v_preview := public.admin_import_stories_v2_preview(p_payload, p_options);
  IF NOT COALESCE((v_preview->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'phase', 'validate', 'preview', v_preview);
  END IF;

  v_result := public._admin_import_stories_v2_apply_core(p_payload, p_options);
  IF NOT COALESCE((v_result->>'ok')::boolean, false) THEN
    RETURN v_result;
  END IF;

  FOR v_story IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_payload->'stories', '[]'::jsonb))
    ORDER BY value->>'id'
  LOOP
    IF COALESCE(v_story#>>'{metadata,kind}', '') = 'campaign_intro'
       OR COALESCE(v_story->'tags', '[]'::jsonb) ? 'campaign-intro' THEN
      v_story_id := btrim(v_story->>'id');
      v_campaign_ref := btrim(v_story#>>'{metadata,campaign_id}');

      SELECT c.id,
             NULLIF(c.data->>'intro_story_id', ''),
             GREATEST(1, COALESCE((c.data->>'intro_version')::integer, 1))
        INTO v_campaign_id, v_old_story_id, v_old_version
      FROM public.admin_campaigns c
      WHERE c.id = v_campaign_ref OR c.slug = v_campaign_ref
      ORDER BY CASE WHEN c.id = v_campaign_ref THEN 0 ELSE 1 END
      LIMIT 1
      FOR UPDATE;

      v_requested_version := CASE
        WHEN COALESCE(v_story#>>'{metadata,intro_version}', '') ~ '^[1-9][0-9]*$'
          THEN (v_story#>>'{metadata,intro_version}')::integer
        ELSE NULL
      END;

      v_new_version := CASE
        WHEN v_requested_version IS NOT NULL THEN v_requested_version
        WHEN v_old_story_id IS NULL OR v_old_story_id = v_story_id THEN v_old_version
        ELSE v_old_version + 1
      END;

      UPDATE public.admin_campaigns
      SET data = jsonb_set(
                   jsonb_set(data, '{intro_story_id}', to_jsonb(v_story_id), true),
                   '{intro_version}', to_jsonb(v_new_version), true
                 ),
          updated_at = now(),
          updated_by = auth.uid()
      WHERE id = v_campaign_id;
    END IF;
  END LOOP;

  RETURN v_result || jsonb_build_object('campaign_intros_linked', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_import_stories_v2_preview(jsonb, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_import_stories_v2_apply(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_import_stories_v2_preview(jsonb, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_import_stories_v2_apply(jsonb, jsonb) TO authenticated, service_role;

-- Repair previously imported published intros only when the campaign currently
-- has no authored intro and exactly one published intro claims it.
WITH candidates AS (
  SELECT c.id AS campaign_id,
         min(s.id) AS story_id,
         count(*) AS candidate_count
  FROM public.admin_campaigns c
  JOIN public.stories s
    ON s.status = 'published'
   AND COALESCE(s.metadata->>'kind', '') = 'campaign_intro'
   AND (s.metadata->>'campaign_id' = c.id OR s.metadata->>'campaign_id' = c.slug)
  WHERE NULLIF(c.data->>'intro_story_id', '') IS NULL
  GROUP BY c.id
)
UPDATE public.admin_campaigns c
SET data = jsonb_set(
             jsonb_set(c.data, '{intro_story_id}', to_jsonb(x.story_id), true),
             '{intro_version}', to_jsonb(1), true
           ),
    updated_at = now()
FROM candidates x
WHERE c.id = x.campaign_id
  AND x.candidate_count = 1;