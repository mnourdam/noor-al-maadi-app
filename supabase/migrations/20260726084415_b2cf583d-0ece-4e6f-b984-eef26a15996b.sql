-- ============================================================
-- ZERO-TRUST SECURITY HARDENING
-- 1. Editorial column isolation (SELECT column grants)
-- 2. Anonymous grant purge
-- 3. campaigns_public -> SECURITY INVOKER
-- 4. search_path fix
-- 5. SECURITY DEFINER function EXECUTE lockdown
-- ============================================================

-- ---------- 1. Editorial column isolation ----------

-- stories: hide unpublished revisions + internal production state
REVOKE SELECT ON public.stories FROM anon, authenticated;
GRANT SELECT (
  id, slug, title_ar, title_en, summary_ar, summary_en, world_slug, era,
  display_order, status, content_version, unlock_spec, cover_media_id,
  xp_reward, dinar_reward, metadata, created_at, updated_at, published_at,
  reaction_count, category, rarity, lock_visibility, historical_confidence,
  hijri_start_year, hijri_end_year, gregorian_start, gregorian_end,
  story_collection_id, schema_version, collection_order,
  hijri_start_month, hijri_start_day, hijri_end_month, hijri_end_day,
  time_precision, length_class, tags, snapshot_tier
) ON public.stories TO anon, authenticated;

-- atlas_entities: hide editor identity columns
REVOKE SELECT ON public.atlas_entities FROM anon, authenticated;
GRANT SELECT (
  id, slug, kind, name_ar, name_en, aps_x, aps_y, aps_verified, aps_verified_at,
  lon, lat, geo_source, atlas_version, era, year_start, year_end, status,
  published_at, encyclopedia_entity_id, metadata, created_at, updated_at
) ON public.atlas_entities TO anon, authenticated;

-- games: hide author identity
REVOKE SELECT ON public.games FROM anon, authenticated;
GRANT SELECT (
  id, slug, mode, title, description, difficulty, estimated_time, xp_reward,
  coin_reward, hearts_penalty, related_entities, metadata, stages, status,
  published_at, created_at, updated_at
) ON public.games TO anon, authenticated;

-- story_media: hide verifier identity
REVOKE SELECT ON public.story_media FROM anon, authenticated;
GRANT SELECT (
  id, story_id, kind, storage_bucket, storage_path, mime_type, byte_size,
  width, height, checksum_sha256, preset, processing_version, verified,
  verified_at, metadata, created_at, updated_at, owner_scope, collection_id
) ON public.story_media TO anon, authenticated;

-- admin_campaigns: keep editorial columns hidden, add public key-art columns
-- (required so campaigns_public can run as SECURITY INVOKER)
REVOKE SELECT ON public.admin_campaigns FROM anon, authenticated;
GRANT SELECT (
  id, slug, title, status, data, created_at, updated_at,
  content_version, published_at,
  key_art_path, key_art_square_path, key_art_credit
) ON public.admin_campaigns TO anon, authenticated;

-- ---------- 2. campaigns_public -> SECURITY INVOKER ----------
ALTER VIEW public.campaigns_public SET (security_invoker = true, security_barrier = true);

-- ---------- 3. search_path hardening ----------
ALTER FUNCTION public._normalize_comment_body(text) SET search_path = public;

-- ---------- 4. Anonymous grant purge ----------
-- anon keeps SELECT on published gameplay content only; nothing else.
DO $$
DECLARE
  r record;
  keep_read text[] := ARRAY[
    'achievement_registry','admin_campaigns','admin_taxonomy','atlas_entities',
    'campaigns_public','content_registry','encyclopedia_entities','games',
    'investigations','investigations_public','stories','story_collections',
    'story_media','story_relations','story_scenes','story_sources',
    'today_in_history_events'
  ];
BEGIN
  FOR r IN
    SELECT c.relname, c.oid
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m')
  LOOP
    IF r.relname = ANY(keep_read) THEN
      -- read-only for guests; column grants above stay intact
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.%I FROM anon', r.relname);
    ELSE
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
    END IF;
  END LOOP;
END $$;

-- Re-assert SELECT for the column-restricted tables (REVOKE ALL above is a no-op
-- for them, but be explicit for views that guests must read).
GRANT SELECT ON public.campaigns_public, public.investigations_public TO anon, authenticated;

-- ---------- 5. Authenticated write purge on read-only / service-only tables ----------
DO $$
DECLARE
  t text;
  readonly_tables text[] := ARRAY[
    'achievement_registry','admin_audit_log','automatic_notification_runs',
    'leaderboard_snapshots','notification_deliveries','pending_action_reminders',
    'referral_rewards','referrals','user_titles','user_streak_reward_claims',
    'email_send_log','email_send_state','email_unsubscribe_tokens',
    'suppressed_emails','reauth_challenges',
    'personal_notifications','social_comments','social_comment_contributions',
    'social_comment_reports'
  ];
BEGIN
  FOREACH t IN ARRAY readonly_tables LOOP
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
  -- these four are RPC-only (no RLS policies at all): no direct reads either
  FOREACH t IN ARRAY ARRAY['personal_notifications','social_comments','social_comment_contributions','social_comment_reports'] LOOP
    EXECUTE format('REVOKE SELECT ON public.%I FROM authenticated', t);
  END LOOP;
END $$;

-- ---------- 6. SECURITY DEFINER function EXECUTE lockdown ----------
DO $$
DECLARE
  f record;
  guest_allowed text[] := ARRAY[
    'current_user_capabilities','evaluate_unlock_spec','evaluate_unlock_spec_v2',
    'get_gated_public_profile','get_gated_public_profile_by_username',
    'get_reactions_for_anchors_v2','get_story_access','get_story_bundle_v2',
    'get_story_collection_v2','get_story_media_urls_v2','has_role',
    'is_username_available','leaderboard_around','leaderboard_around_me',
    'leaderboard_global','leaderboard_top','list_comments_v2',
    'list_public_contributions_v2','list_published_stories','list_stories_v2',
    'list_stories_v3','list_story_collections_v2','stories_snapshot_manifest_v2'
  ];
  service_only text[] := ARRAY[
    'enqueue_email','email_queue_dispatch','read_email_batch','move_to_dlq',
    'delete_email','send_friend_request_reminders'
  ];
BEGIN
  FOR f IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS ret
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', f.proname, f.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', f.proname, f.args);

    IF f.ret = 'trigger' OR f.proname = ANY(service_only) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated', f.proname, f.args);
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', f.proname, f.args);
      IF f.proname = ANY(guest_allowed) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon', f.proname, f.args);
      END IF;
    END IF;
  END LOOP;
END $$;