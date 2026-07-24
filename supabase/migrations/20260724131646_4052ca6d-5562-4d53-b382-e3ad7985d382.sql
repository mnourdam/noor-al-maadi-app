DO $mig$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc WHERE proname='admin_import_stories_v2_apply';
  v_def := replace(v_def, '(v_source->>''weight'')::int', '(v_source->>''weight'')::numeric');
  EXECUTE v_def;
END $mig$;