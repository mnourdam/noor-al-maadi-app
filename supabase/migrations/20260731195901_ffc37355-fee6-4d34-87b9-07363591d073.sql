CREATE OR REPLACE FUNCTION public.purge_user_account_data(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;

  -- 1) Clear references to shared / public content the user does not solely own.
  UPDATE public.admin_audit_log SET actor_id = NULL WHERE actor_id = p_user_id;
  UPDATE public.admin_audit_log SET target_user_id = NULL WHERE target_user_id = p_user_id;
  UPDATE public.atlas_import_runs SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.games SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.story_media SET verified_by = NULL WHERE verified_by = p_user_id;
  UPDATE public.notifications SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE public.personal_notifications SET last_actor_id = NULL WHERE last_actor_id = p_user_id;
  UPDATE public.social_comments SET moderated_by = NULL WHERE moderated_by = p_user_id;
  UPDATE public.social_comment_reports SET resolved_by = NULL WHERE resolved_by = p_user_id;
  UPDATE public.social_comment_contributions SET archived_by = NULL WHERE archived_by = p_user_id;
  UPDATE public.social_comment_contributions SET marked_by = NULL WHERE marked_by = p_user_id;
  UPDATE public.social_comment_contributions SET applied_by = NULL WHERE applied_by = p_user_id;
  UPDATE public.feedback_issues SET assigned_to = NULL WHERE assigned_to = p_user_id;

  -- 2) Delete rows owned by the user that do not cascade from auth.users.
  DELETE FROM public.feedback_messages WHERE author_id = p_user_id;
  DELETE FROM public.feedback_issues WHERE reporter_id = p_user_id;
  DELETE FROM public.newsletter_subscribers WHERE user_id = p_user_id;
  DELETE FROM public.leaderboard_snapshots WHERE user_id = p_user_id;
  DELETE FROM public.pending_action_reminders WHERE user_id = p_user_id;
  DELETE FROM public.reauth_challenges WHERE user_id = p_user_id;
  DELETE FROM public.user_campaign_intros WHERE user_id = p_user_id;
  DELETE FROM public.admin_import_batches WHERE admin_user_id = p_user_id;

  IF v_email IS NOT NULL THEN
    DELETE FROM public.email_unsubscribe_tokens WHERE email = v_email;
    DELETE FROM public.email_send_state WHERE recipient_email = v_email;
  END IF;

  -- 3) Explicitly delete the cascading personal tables so the purge is
  --    complete even if the auth.users row deletion is retried later.
  DELETE FROM public.device_tokens WHERE user_id = p_user_id;
  DELETE FROM public.notification_deliveries WHERE user_id = p_user_id;
  DELETE FROM public.notification_preferences WHERE user_id = p_user_id;
  DELETE FROM public.notifications WHERE target_user_id = p_user_id;
  DELETE FROM public.personal_notifications WHERE user_id = p_user_id;
  DELETE FROM public.social_comment_reports WHERE reporter_id = p_user_id;
  DELETE FROM public.social_reactions WHERE user_id = p_user_id;
  DELETE FROM public.social_comments WHERE author_id = p_user_id;
  DELETE FROM public.applied_profile_deltas WHERE user_id = p_user_id;
  DELETE FROM public.identity_link_audit WHERE user_id = p_user_id;
  DELETE FROM public.user_achievements WHERE user_id = p_user_id;
  DELETE FROM public.user_campaign_completions WHERE user_id = p_user_id;
  DELETE FROM public.user_campaign_progress WHERE user_id = p_user_id;
  DELETE FROM public.user_collection WHERE user_id = p_user_id;
  DELETE FROM public.user_entity_discoveries WHERE user_id = p_user_id;
  DELETE FROM public.user_investigation_progress WHERE user_id = p_user_id;
  DELETE FROM public.user_onboarding_state WHERE user_id = p_user_id;
  DELETE FROM public.user_reflections WHERE user_id = p_user_id;
  DELETE FROM public.user_story_completions WHERE user_id = p_user_id;
  DELETE FROM public.user_story_progress WHERE user_id = p_user_id;
  DELETE FROM public.user_streak_reward_claims WHERE user_id = p_user_id;
  DELETE FROM public.user_titles WHERE user_id = p_user_id;
  DELETE FROM public.user_roles WHERE user_id = p_user_id;
  DELETE FROM public.game_progress WHERE user_id = p_user_id;
  DELETE FROM public.cloud_saves WHERE user_id = p_user_id;
  DELETE FROM public.profiles WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user_account_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_user_account_data(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.purge_user_account_data(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user_account_data(uuid) TO service_role;