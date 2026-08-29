DO $$
DECLARE
  v_deprecated CONSTANT text := '10fc1316-e685-4080-bc0c-0f93de0ed65f';
  v_canonical  CONSTANT text := '3919a011-690e-48d5-b08a-99a0a75f1f6c';
  v_ok boolean;
  v_rows int;
BEGIN
  -- Guard: canonical replacement must exist AND be enabled AND declare the
  -- deprecated row as merged into it. Otherwise do nothing.
  SELECT EXISTS (
    SELECT 1 FROM public.encyclopedia_entities e
    WHERE e.id::text = v_canonical
      AND e.enabled
      AND e.metadata->'merged_from' @> jsonb_build_array(jsonb_build_object('id', v_deprecated))
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'canonical replacement % not verified; aborting', v_canonical;
  END IF;

  UPDATE public.stories
     SET unlock_spec = replace(unlock_spec::text, v_deprecated, v_canonical)::jsonb
   WHERE unlock_spec::text LIKE '%' || v_deprecated || '%';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'unlock_spec rows repaired: %', v_rows;

  UPDATE public.stories
     SET previous_draft = replace(previous_draft::text, v_deprecated, v_canonical)::jsonb
   WHERE previous_draft IS NOT NULL
     AND previous_draft::text LIKE '%' || v_deprecated || '%';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'previous_draft rows repaired: %', v_rows;
END $$;