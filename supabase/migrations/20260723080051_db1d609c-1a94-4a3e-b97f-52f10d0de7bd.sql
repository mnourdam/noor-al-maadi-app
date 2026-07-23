
DO $mig$
DECLARE
  fn_name text;
  fn_names text[] := ARRAY[
    -- Stories admin
    'admin_list_stories','admin_get_story_full','admin_upsert_story','admin_upsert_story_scene',
    'admin_set_story_status','admin_delete_story_scene','admin_delete_story_media',
    'admin_reorder_story_scenes','admin_register_story_media','admin_mark_story_media_verified',
    'admin_list_story_media_orphans','admin_validate_story_publish',
    -- Moderation / contributions
    'apply_contribution_v2','archive_contribution_v2','dismiss_report_v2','list_comment_reports_v2',
    'list_contribution_queue_v2','list_moderation_history_v2','list_moderator_queue_v2',
    'mark_contribution_v2','moderate_comment_v2','unmark_contribution_v2'
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
      new_def := def;
      -- Legacy admin-only checks
      new_def := replace(new_def, 'public.has_role(v_uid, ''admin'')',      'public.is_content_editor()');
      new_def := replace(new_def, 'public.has_role(auth.uid(), ''admin'')', 'public.is_content_editor()');
      new_def := replace(new_def, 'has_role(v_uid, ''admin''::app_role)',   'public.is_content_editor()');
      new_def := replace(new_def, 'has_role(auth.uid(), ''admin''::app_role)', 'public.is_content_editor()');
      -- Broaden manager-only gates to match AdminGate (editor+manager)
      new_def := replace(new_def, 'public.is_user_manager()', 'public.is_content_editor()');
      IF new_def <> def THEN
        EXECUTE new_def;
      END IF;
    END LOOP;
  END LOOP;
END
$mig$;
