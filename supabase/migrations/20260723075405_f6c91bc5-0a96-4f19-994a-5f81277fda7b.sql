
DO $mig$
DECLARE
  fn_name text;
  fn_names text[] := ARRAY[
    'apply_contribution_v2',
    'archive_contribution_v2',
    'dismiss_report_v2',
    'list_comment_reports_v2',
    'list_contribution_queue_v2',
    'list_moderation_history_v2',
    'list_moderator_queue_v2',
    'mark_contribution_v2',
    'moderate_comment_v2',
    'unmark_contribution_v2'
  ];
  def text;
  new_def text;
  rec record;
BEGIN
  FOREACH fn_name IN ARRAY fn_names LOOP
    FOR rec IN
      SELECT pg_get_functiondef(p.oid) AS d
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = fn_name
    LOOP
      def := rec.d;
      new_def := replace(def, 'public.has_role(v_uid, ''admin'')', 'public.is_user_manager()');
      new_def := replace(new_def, 'public.has_role(auth.uid(), ''admin'')', 'public.is_user_manager()');
      new_def := replace(new_def, 'has_role(v_uid, ''admin''::app_role)', 'public.is_user_manager()');
      new_def := replace(new_def, 'has_role(auth.uid(), ''admin''::app_role)', 'public.is_user_manager()');
      IF new_def <> def THEN
        EXECUTE new_def;
      END IF;
    END LOOP;
  END LOOP;
END
$mig$;
