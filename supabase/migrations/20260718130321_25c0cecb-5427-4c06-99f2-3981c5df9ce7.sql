
CREATE OR REPLACE FUNCTION public.backfill_investigation_completions(
  p_legacy_keys TEXT[]
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
  v_investigation_id UUID;
  v_inserted BOOLEAN;
  v_row_count INTEGER;
  v_results JSONB := '[]'::jsonb;
  v_inserted_count INTEGER := 0;
  v_already_count  INTEGER := 0;
  v_notfound_count INTEGER := 0;
  v_total INTEGER := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF p_legacy_keys IS NULL OR array_length(p_legacy_keys, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'inserted', 0, 'already_present', 0, 'not_found', 0,
      'total', 0, 'results', '[]'::jsonb
    );
  END IF;

  FOREACH v_key IN ARRAY p_legacy_keys LOOP
    v_total := v_total + 1;
    v_investigation_id := NULL;
    v_inserted := false;

    IF v_key IS NULL OR length(trim(v_key)) = 0 THEN
      v_notfound_count := v_notfound_count + 1;
      v_results := v_results || jsonb_build_object(
        'key', v_key, 'resolved', false, 'reason', 'empty_key'
      );
      CONTINUE;
    END IF;

    BEGIN
      SELECT id INTO v_investigation_id
        FROM public.investigations WHERE id = v_key::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_investigation_id := NULL;
    END;

    IF v_investigation_id IS NULL THEN
      SELECT id INTO v_investigation_id
        FROM public.investigations WHERE slug = v_key;
    END IF;

    IF v_investigation_id IS NULL THEN
      v_notfound_count := v_notfound_count + 1;
      v_results := v_results || jsonb_build_object(
        'key', v_key, 'resolved', false, 'reason', 'not_found'
      );
      CONTINUE;
    END IF;

    INSERT INTO public.user_investigation_progress (
      user_id, investigation_id, status,
      xp_earned, dinars_earned, hearts_earned,
      legacy_key, completed_at
    ) VALUES (
      v_uid, v_investigation_id, 'completed',
      0, 0, 0, v_key, now()
    )
    ON CONFLICT (user_id, investigation_id) DO NOTHING;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    v_inserted := v_row_count > 0;

    IF v_inserted THEN
      v_inserted_count := v_inserted_count + 1;
    ELSE
      v_already_count := v_already_count + 1;
    END IF;

    v_results := v_results || jsonb_build_object(
      'key', v_key,
      'resolved', true,
      'inserted', v_inserted,
      'investigation_id', v_investigation_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'total', v_total,
    'inserted', v_inserted_count,
    'already_present', v_already_count,
    'not_found', v_notfound_count,
    'results', v_results
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_investigation_completions(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.backfill_investigation_completions(TEXT[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.backfill_investigation_completions(TEXT[]) TO authenticated;
