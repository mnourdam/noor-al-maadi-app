-- ============================================================
-- Investigation Reward Reconciliation (admin maintenance tool)
-- ------------------------------------------------------------
-- Idempotent, evidence-based recovery for investigation
-- completions that never produced an economy grant (legacy
-- backfills). Uses the SAME capped reward rules as
-- complete_investigation_v2 and a deterministic delta id so the
-- tool can be executed any number of times without double-paying.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_investigation_reward_audit()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_rows  jsonb;
  v_tot_x INT := 0;
  v_tot_d INT := 0;
  v_tot_h INT := 0;
  v_pend  INT := 0;
  v_done  INT := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'owner')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  WITH base AS (
    SELECT
      p.user_id,
      p.investigation_id,
      i.slug,
      i.title,
      p.completed_at,
      LEAST(150, GREATEST(0, COALESCE((i.reward->>'xp')::int, 0)))                                  AS xp,
      LEAST(50,  GREATEST(0, COALESCE((i.reward->>'dinars')::int, (i.reward->>'coins')::int, 0)))   AS dinars,
      LEAST(5,   GREATEST(0, COALESCE((i.reward->>'hearts')::int, 0)))                              AS hearts,
      public.stable_delta_uuid('investigation_reward_backfill:' || p.user_id::text || ':' || p.investigation_id::text) AS delta_id,
      EXISTS (
        SELECT 1 FROM public.applied_profile_deltas d
         WHERE d.user_id = p.user_id
           AND d.source = 'investigation_complete:' || p.investigation_id::text
      ) AS live_granted
    FROM public.user_investigation_progress p
    JOIN public.investigations i ON i.id = p.investigation_id
    WHERE p.completed_at IS NOT NULL
  ), classified AS (
    SELECT
      b.*,
      EXISTS (SELECT 1 FROM public.applied_profile_deltas d WHERE d.delta_id = b.delta_id) AS backfill_granted
    FROM base b
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', c.user_id,
      'username', pr.username,
      'investigation_id', c.investigation_id,
      'slug', c.slug,
      'title', c.title,
      'completed_at', c.completed_at,
      'xp', c.xp,
      'dinars', c.dinars,
      'hearts', c.hearts,
      'state', CASE
                 WHEN c.live_granted THEN 'already_granted'
                 WHEN c.backfill_granted THEN 'already_backfilled'
                 WHEN c.xp = 0 AND c.dinars = 0 AND c.hearts = 0 THEN 'nothing_to_grant'
                 ELSE 'pending'
               END
    ) ORDER BY c.completed_at), '[]'::jsonb),
    COALESCE(SUM(CASE WHEN NOT c.live_granted AND NOT c.backfill_granted THEN c.xp ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT c.live_granted AND NOT c.backfill_granted THEN c.dinars ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN NOT c.live_granted AND NOT c.backfill_granted THEN c.hearts ELSE 0 END), 0),
    COUNT(*) FILTER (WHERE NOT c.live_granted AND NOT c.backfill_granted
                       AND (c.xp > 0 OR c.dinars > 0 OR c.hearts > 0)),
    COUNT(*) FILTER (WHERE c.live_granted OR c.backfill_granted)
  INTO v_rows, v_tot_x, v_tot_d, v_tot_h, v_pend, v_done
  FROM classified c
  LEFT JOIN public.profiles pr ON pr.id = c.user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'rows', v_rows,
    'pending_count', v_pend,
    'granted_count', v_done,
    'pending_users', (SELECT COUNT(DISTINCT (r->>'user_id'))
                        FROM jsonb_array_elements(v_rows) r
                       WHERE r->>'state' = 'pending'),
    'pending_xp', v_tot_x,
    'pending_dinars', v_tot_d,
    'pending_hearts', v_tot_h
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_investigation_reward_audit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_investigation_reward_audit() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_investigation_reward_reconcile(
  p_dry_run BOOLEAN DEFAULT true,
  p_user_ids UUID[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_r      RECORD;
  v_ins    INT;
  v_apply  jsonb := '[]'::jsonb;
  v_skip   jsonb := '[]'::jsonb;
  v_xp     INT := 0;
  v_din    INT := 0;
  v_hrt    INT := 0;
  v_users  UUID[] := ARRAY[]::UUID[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF NOT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'owner')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  FOR v_r IN
    SELECT
      p.user_id,
      p.investigation_id,
      i.slug,
      LEAST(150, GREATEST(0, COALESCE((i.reward->>'xp')::int, 0)))                                AS xp,
      LEAST(50,  GREATEST(0, COALESCE((i.reward->>'dinars')::int, (i.reward->>'coins')::int, 0))) AS dinars,
      LEAST(5,   GREATEST(0, COALESCE((i.reward->>'hearts')::int, 0)))                            AS hearts,
      NULLIF(i.reward->>'artifact', '')                                                           AS artifact,
      NULLIF(i.reward->>'badge', '')                                                              AS badge,
      public.stable_delta_uuid('investigation_reward_backfill:' || p.user_id::text || ':' || p.investigation_id::text) AS delta_id
    FROM public.user_investigation_progress p
    JOIN public.investigations i ON i.id = p.investigation_id
    WHERE p.completed_at IS NOT NULL
      AND (p_user_ids IS NULL OR p.user_id = ANY(p_user_ids))
      AND NOT EXISTS (
        SELECT 1 FROM public.applied_profile_deltas d
         WHERE d.user_id = p.user_id
           AND d.source = 'investigation_complete:' || p.investigation_id::text
      )
    ORDER BY p.completed_at
  LOOP
    IF v_r.xp = 0 AND v_r.dinars = 0 AND v_r.hearts = 0 THEN
      v_skip := v_skip || jsonb_build_object(
        'user_id', v_r.user_id, 'slug', v_r.slug, 'reason', 'nothing_to_grant');
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM public.applied_profile_deltas d WHERE d.delta_id = v_r.delta_id) THEN
      v_skip := v_skip || jsonb_build_object(
        'user_id', v_r.user_id, 'slug', v_r.slug, 'reason', 'already_backfilled');
      CONTINUE;
    END IF;

    v_xp  := v_xp + v_r.xp;
    v_din := v_din + v_r.dinars;
    v_hrt := v_hrt + v_r.hearts;
    IF NOT (v_r.user_id = ANY(v_users)) THEN v_users := v_users || v_r.user_id; END IF;
    v_apply := v_apply || jsonb_build_object(
      'user_id', v_r.user_id, 'investigation_id', v_r.investigation_id,
      'slug', v_r.slug, 'xp', v_r.xp, 'dinars', v_r.dinars, 'hearts', v_r.hearts);

    IF NOT p_dry_run THEN
      INSERT INTO public.applied_profile_deltas(delta_id, user_id, xp, dinars, hearts, source)
      VALUES (v_r.delta_id, v_r.user_id, v_r.xp, v_r.dinars, v_r.hearts,
              'investigation_complete:' || v_r.investigation_id::text)
      ON CONFLICT (delta_id) DO NOTHING;
      GET DIAGNOSTICS v_ins = ROW_COUNT;

      IF v_ins > 0 THEN
        UPDATE public.profiles
           SET xp     = GREATEST(0, COALESCE(xp, 0) + v_r.xp),
               dinars = GREATEST(0, COALESCE(dinars, 0) + v_r.dinars),
               hearts = LEAST(5, GREATEST(0, COALESCE(hearts, 5) + v_r.hearts))
         WHERE id = v_r.user_id;

        -- Backfill the completion row's reward snapshot so the runtime
        -- replay path reports the historically granted amounts.
        UPDATE public.user_investigation_progress
           SET xp_earned      = GREATEST(COALESCE(xp_earned, 0), v_r.xp),
               dinars_earned  = GREATEST(COALESCE(dinars_earned, 0), v_r.dinars),
               hearts_earned  = GREATEST(COALESCE(hearts_earned, 0), v_r.hearts),
               badge_awarded  = COALESCE(badge_awarded, v_r.badge),
               artifact_awarded = COALESCE(artifact_awarded, v_r.artifact),
               reward_snapshot = COALESCE(reward_snapshot, jsonb_build_object(
                 'v', 1, 'badge', v_r.badge, 'artifact', v_r.artifact,
                 'xp', v_r.xp, 'dinars', v_r.dinars, 'hearts', v_r.hearts,
                 'granted_at', now(), 'source', 'admin_reconcile')),
               updated_at = now()
         WHERE user_id = v_r.user_id AND investigation_id = v_r.investigation_id;

        IF v_r.artifact IS NOT NULL THEN
          INSERT INTO public.user_collection (user_id, item_id, item_type)
          VALUES (v_r.user_id, v_r.artifact, 'artifact')
          ON CONFLICT (user_id, item_id) DO NOTHING;
        END IF;
      ELSE
        v_skip := v_skip || jsonb_build_object(
          'user_id', v_r.user_id, 'slug', v_r.slug, 'reason', 'race_already_granted');
      END IF;
    END IF;
  END LOOP;

  IF NOT p_dry_run THEN
    INSERT INTO public.admin_audit_log(actor_id, action, entity_type, entity_id, details)
    VALUES (v_uid, 'investigation_reward_reconcile', 'investigation', NULL,
            jsonb_build_object('granted', v_apply, 'skipped', v_skip,
                               'xp', v_xp, 'dinars', v_din, 'hearts', v_hrt));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', p_dry_run,
    'granted', v_apply,
    'skipped', v_skip,
    'users_affected', COALESCE(array_length(v_users, 1), 0),
    'investigations_affected', jsonb_array_length(v_apply),
    'total_xp', v_xp,
    'total_dinars', v_din,
    'total_hearts', v_hrt
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_investigation_reward_reconcile(BOOLEAN, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_investigation_reward_reconcile(BOOLEAN, UUID[]) TO authenticated;