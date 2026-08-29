-- ============================================================
-- V16 Phase B — Announcements + Optional/Mandatory update policy
-- Fully ADDITIVE. No existing table/RPC is modified.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('generic','optional_update','mandatory_update')),
  platform text NOT NULL DEFAULT 'all' CHECK (platform IN ('android','web','all')),
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  cta_label text,
  internal_path text,
  external_url text,
  recommended_version_code integer,
  min_version_code integer,
  segment_id text,
  segment_filters jsonb,
  priority integer NOT NULL DEFAULT 0,
  dismissible boolean NOT NULL DEFAULT true,
  once_per_user boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  expires_at timestamptz,
  effective_at timestamptz,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- generic: at most one action
  CONSTRAINT app_ann_action_exclusive CHECK (
    internal_path IS NULL OR external_url IS NULL
  ),
  -- update kinds carry no admin-defined action and no segment
  CONSTRAINT app_ann_update_no_action CHECK (
    kind = 'generic' OR (internal_path IS NULL AND external_url IS NULL
                         AND segment_id IS NULL AND segment_filters IS NULL)
  ),
  -- update kinds are Android-only
  CONSTRAINT app_ann_update_android CHECK (
    kind = 'generic' OR platform = 'android'
  ),
  -- mandatory needs a positive min version
  CONSTRAINT app_ann_mandatory_min CHECK (
    kind <> 'mandatory_update' OR (min_version_code IS NOT NULL AND min_version_code > 0)
  ),
  -- optional needs a positive recommended version
  CONSTRAINT app_ann_optional_recommended CHECK (
    kind <> 'optional_update' OR (recommended_version_code IS NOT NULL AND recommended_version_code > 0)
  ),
  CONSTRAINT app_ann_version_order CHECK (
    min_version_code IS NULL OR recommended_version_code IS NULL
      OR min_version_code <= recommended_version_code
  ),
  CONSTRAINT app_ann_internal_path_shape CHECK (
    internal_path IS NULL OR (internal_path ~ '^/[^/\s][^\s]*$' OR internal_path = '/')
  ),
  CONSTRAINT app_ann_external_https CHECK (
    external_url IS NULL OR external_url ~* '^https://[^\s/@]+\.[^\s/@]+'
  )
);

CREATE INDEX IF NOT EXISTS app_announcements_active_idx
  ON public.app_announcements (is_active, kind, platform);

GRANT SELECT ON public.app_announcements TO authenticated;
GRANT ALL ON public.app_announcements TO service_role;
ALTER TABLE public.app_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_announcements_admin_read" ON public.app_announcements;
CREATE POLICY "app_announcements_admin_read"
  ON public.app_announcements FOR SELECT TO authenticated
  USING (public.is_content_editor());

CREATE TABLE IF NOT EXISTS public.app_announcement_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.app_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL DEFAULT 'dismissed',
  acked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (announcement_id, user_id)
);

GRANT SELECT, INSERT ON public.app_announcement_acks TO authenticated;
GRANT ALL ON public.app_announcement_acks TO service_role;
ALTER TABLE public.app_announcement_acks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_ann_acks_own_read" ON public.app_announcement_acks;
CREATE POLICY "app_ann_acks_own_read"
  ON public.app_announcement_acks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "app_ann_acks_own_write" ON public.app_announcement_acks;
CREATE POLICY "app_ann_acks_own_write"
  ON public.app_announcement_acks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.app_announcements_touch_v16()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS app_announcements_touch ON public.app_announcements;
CREATE TRIGGER app_announcements_touch
  BEFORE UPDATE ON public.app_announcements
  FOR EACH ROW EXECUTE FUNCTION public.app_announcements_touch_v16();

-- ============================================================
-- Self-membership segment evaluation (never expands an audience)
-- ============================================================
CREATE OR REPLACE FUNCTION public.announcement_segment_matches_v16(
  p_uid uuid, p_segment_id text, p_filter jsonb
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_field text; v_op text; v_value numeric; v_metric numeric; v_hit boolean;
BEGIN
  IF p_uid IS NULL THEN RETURN false; END IF;

  IF p_filter IS NOT NULL AND p_filter <> 'null'::jsonb THEN
    IF p_segment_id IS NOT NULL AND p_segment_id <> '' THEN RETURN false; END IF;
    v_field := p_filter->>'field';
    v_op    := p_filter->>'op';
    IF v_field IS NULL OR v_field NOT IN ('level','xp','streak','hearts','account_age_days')
       THEN RETURN false; END IF;
    IF v_op IS NULL OR v_op NOT IN ('=','>','>=','<','<=') THEN RETURN false; END IF;
    BEGIN v_value := (p_filter->>'value')::numeric;
    EXCEPTION WHEN others THEN RETURN false; END;

    SELECT CASE v_field
             WHEN 'level'  THEN COALESCE(p.level, 1)::numeric
             WHEN 'xp'     THEN COALESCE(p.xp, 0)::numeric
             WHEN 'streak' THEN COALESCE(p.streak, 0)::numeric
             WHEN 'hearts' THEN COALESCE(p.hearts, 0)::numeric
             ELSE FLOOR(EXTRACT(EPOCH FROM (now() - p.created_at)) / 86400)::numeric
           END
      INTO v_metric FROM public.profiles p WHERE p.id = p_uid;
    IF v_metric IS NULL THEN RETURN false; END IF;
    RETURN CASE v_op
             WHEN '='  THEN v_metric =  v_value
             WHEN '>'  THEN v_metric >  v_value
             WHEN '>=' THEN v_metric >= v_value
             WHEN '<'  THEN v_metric <  v_value
             WHEN '<=' THEN v_metric <= v_value
           END;
  END IF;

  IF p_segment_id IS NULL OR p_segment_id = '' THEN RETURN false; END IF;

  CASE p_segment_id
    WHEN 'level_20_plus' THEN SELECT COALESCE(level,1) >= 20 INTO v_hit FROM public.profiles WHERE id = p_uid;
    WHEN 'level_50_plus' THEN SELECT COALESCE(level,1) >= 50 INTO v_hit FROM public.profiles WHERE id = p_uid;
    WHEN 'new_players' THEN SELECT created_at > now() - interval '7 days' INTO v_hit FROM public.profiles WHERE id = p_uid;
    WHEN 'veteran_players' THEN SELECT created_at < now() - interval '60 days' INTO v_hit FROM public.profiles WHERE id = p_uid;
    WHEN 'active_today' THEN SELECT last_active > now() - interval '1 day' INTO v_hit FROM public.profiles WHERE id = p_uid;
    WHEN 'active_this_week' THEN SELECT last_active > now() - interval '7 days' INTO v_hit FROM public.profiles WHERE id = p_uid;
    WHEN 'inactive_7d' THEN SELECT (last_active < now() - interval '7 days' OR last_active IS NULL) INTO v_hit FROM public.profiles WHERE id = p_uid;
    WHEN 'inactive_30d' THEN SELECT (last_active < now() - interval '30 days' OR last_active IS NULL) INTO v_hit FROM public.profiles WHERE id = p_uid;
    WHEN 'low_hearts' THEN SELECT COALESCE(hearts,0) < 3 INTO v_hit FROM public.profiles WHERE id = p_uid;
    WHEN 'no_hearts' THEN SELECT COALESCE(hearts,0) = 0 INTO v_hit FROM public.profiles WHERE id = p_uid;
    WHEN 'full_hearts' THEN SELECT COALESCE(hearts,0) >= 5 INTO v_hit FROM public.profiles WHERE id = p_uid;
    WHEN 'campaign_in_progress' THEN
      SELECT EXISTS (SELECT 1 FROM public.user_campaign_progress WHERE user_id = p_uid AND completed_at IS NULL) INTO v_hit;
    WHEN 'campaign_completed_any' THEN
      SELECT EXISTS (SELECT 1 FROM public.user_campaign_progress WHERE user_id = p_uid AND completed_at IS NOT NULL) INTO v_hit;
    WHEN 'never_started_campaigns' THEN
      SELECT NOT EXISTS (SELECT 1 FROM public.user_campaign_progress WHERE user_id = p_uid) INTO v_hit;
    WHEN 'has_pending_friend_requests' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE f.status = 'pending' AND f.requester <> p_uid
          AND (f.user_a = p_uid OR f.user_b = p_uid)
      ) INTO v_hit;
    WHEN 'no_friends' THEN
      SELECT NOT EXISTS (
        SELECT 1 FROM public.friendships f
        WHERE (f.user_a = p_uid OR f.user_b = p_uid) AND f.status = 'accepted'
      ) INTO v_hit;
    ELSE
      RETURN false;   -- unknown segment → fail closed (hidden)
  END CASE;

  RETURN COALESCE(v_hit, false);
EXCEPTION WHEN others THEN
  RETURN false;       -- resolver error → hidden, never widened
END; $$;

REVOKE ALL ON FUNCTION public.announcement_segment_matches_v16(uuid, text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.announcement_segment_matches_v16(uuid, text, jsonb) TO service_role;

-- ============================================================
-- Public read RPC — safe fields only
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_active_announcements_v16(
  p_platform text DEFAULT 'web'
) RETURNS TABLE (
  id uuid, kind text, platform text, title text, body text, cta_label text,
  internal_path text, external_url text,
  recommended_version_code integer, min_version_code integer,
  priority integer, dismissible boolean, once_per_user boolean,
  effective_at timestamptz, server_time timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_platform text := lower(COALESCE(p_platform, ''));
BEGIN
  IF v_platform NOT IN ('android','web') THEN v_platform := 'web'; END IF;

  RETURN QUERY
  SELECT a.id, a.kind, a.platform, a.title, a.body, a.cta_label,
         a.internal_path, a.external_url,
         a.recommended_version_code, a.min_version_code,
         a.priority, a.dismissible, a.once_per_user,
         a.effective_at, now() AS server_time
  FROM public.app_announcements a
  WHERE a.is_active
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.expires_at IS NULL OR a.expires_at > now())
    AND (a.platform = 'all' OR a.platform = v_platform)
    -- update kinds are Android-only, always
    AND (a.kind = 'generic' OR v_platform = 'android')
    -- mandatory must be explicitly effective
    AND (a.kind <> 'mandatory_update'
         OR (a.effective_at IS NOT NULL AND a.effective_at <= now()))
    -- generic targeting: self-membership only, fail closed
    AND (
      a.kind <> 'generic'
      OR (a.segment_id IS NULL AND (a.segment_filters IS NULL OR a.segment_filters = 'null'::jsonb))
      OR (v_uid IS NOT NULL
          AND public.announcement_segment_matches_v16(v_uid, a.segment_id, a.segment_filters))
    )
    -- once-per-user acknowledgement (signed-in only; guests ack locally)
    AND (
      a.kind <> 'generic' OR NOT a.once_per_user OR v_uid IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.app_announcement_acks k
        WHERE k.announcement_id = a.id AND k.user_id = v_uid
      )
    )
  ORDER BY a.priority DESC, a.created_at DESC;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_active_announcements_v16(text) TO anon, authenticated, service_role;

-- ============================================================
-- Acknowledgement (scoped to auth.uid())
-- ============================================================
CREATE OR REPLACE FUNCTION public.ack_announcement_v16(
  p_announcement_id uuid, p_action text DEFAULT 'dismissed'
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_kind text;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  SELECT kind INTO v_kind FROM public.app_announcements WHERE id = p_announcement_id;
  IF v_kind IS NULL THEN RETURN false; END IF;
  -- Mandatory updates can never be acknowledged away.
  IF v_kind = 'mandatory_update' THEN RETURN false; END IF;

  INSERT INTO public.app_announcement_acks (announcement_id, user_id, action)
  VALUES (p_announcement_id, v_uid, COALESCE(NULLIF(p_action,''), 'dismissed'))
  ON CONFLICT (announcement_id, user_id) DO NOTHING;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.ack_announcement_v16(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.ack_announcement_v16(uuid, text) TO authenticated, service_role;

-- ============================================================
-- Admin write RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_upsert_announcement_v16(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_kind text := COALESCE(p_payload->>'kind','generic');
  v_platform text := COALESCE(NULLIF(p_payload->>'platform',''),'all');
  v_internal text := NULLIF(p_payload->>'internal_path','');
  v_external text := NULLIF(p_payload->>'external_url','');
  v_segment text := NULLIF(p_payload->>'segment_id','');
  v_filters jsonb := CASE WHEN p_payload->'segment_filters' IS NULL
                            OR p_payload->'segment_filters' = 'null'::jsonb
                          THEN NULL ELSE p_payload->'segment_filters' END;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_kind NOT IN ('generic','optional_update','mandatory_update')
    THEN RAISE EXCEPTION 'invalid_kind'; END IF;

  IF v_kind = 'generic' THEN
    IF v_internal IS NOT NULL AND v_external IS NOT NULL
      THEN RAISE EXCEPTION 'invalid_action: internal and external are mutually exclusive'; END IF;
  ELSE
    -- update kinds: destination is fixed by code, never admin-defined
    v_internal := NULL; v_external := NULL; v_segment := NULL; v_filters := NULL;
    v_platform := 'android';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.app_announcements (
      kind, platform, title, body, cta_label, internal_path, external_url,
      recommended_version_code, min_version_code, segment_id, segment_filters,
      priority, dismissible, once_per_user, starts_at, expires_at, effective_at,
      is_active, created_by
    ) VALUES (
      v_kind, v_platform,
      COALESCE(NULLIF(p_payload->>'title',''),'إشعار'),
      COALESCE(p_payload->>'body',''),
      NULLIF(p_payload->>'cta_label',''), v_internal, v_external,
      NULLIF(p_payload->>'recommended_version_code','')::int,
      NULLIF(p_payload->>'min_version_code','')::int,
      v_segment, v_filters,
      COALESCE(NULLIF(p_payload->>'priority','')::int, 0),
      COALESCE((p_payload->>'dismissible')::boolean, true),
      COALESCE((p_payload->>'once_per_user')::boolean, true),
      NULLIF(p_payload->>'starts_at','')::timestamptz,
      NULLIF(p_payload->>'expires_at','')::timestamptz,
      NULLIF(p_payload->>'effective_at','')::timestamptz,
      false,                        -- ALWAYS created inactive
      v_uid
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.app_announcements SET
      kind = v_kind, platform = v_platform,
      title = COALESCE(NULLIF(p_payload->>'title',''), title),
      body = COALESCE(p_payload->>'body', body),
      cta_label = NULLIF(p_payload->>'cta_label',''),
      internal_path = v_internal, external_url = v_external,
      recommended_version_code = NULLIF(p_payload->>'recommended_version_code','')::int,
      min_version_code = NULLIF(p_payload->>'min_version_code','')::int,
      segment_id = v_segment, segment_filters = v_filters,
      priority = COALESCE(NULLIF(p_payload->>'priority','')::int, priority),
      dismissible = COALESCE((p_payload->>'dismissible')::boolean, dismissible),
      once_per_user = COALESCE((p_payload->>'once_per_user')::boolean, once_per_user),
      starts_at = NULLIF(p_payload->>'starts_at','')::timestamptz,
      expires_at = NULLIF(p_payload->>'expires_at','')::timestamptz,
      effective_at = NULLIF(p_payload->>'effective_at','')::timestamptz
    WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  END IF;

  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.admin_upsert_announcement_v16(jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_announcement_v16(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_announcement_active_v16(
  p_id uuid, p_active boolean, p_confirm text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_kind text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF NOT public.is_content_editor() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT kind INTO v_kind FROM public.app_announcements WHERE id = p_id;
  IF v_kind IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;

  IF v_kind = 'mandatory_update' AND p_active THEN
    IF NOT (public.has_role(v_uid,'owner') OR public.has_role(v_uid,'admin'))
      THEN RAISE EXCEPTION 'forbidden_mandatory_activation'; END IF;
    IF COALESCE(p_confirm,'') <> 'تفعيل التحديث الإجباري'
      THEN RAISE EXCEPTION 'confirmation_required'; END IF;
  END IF;

  UPDATE public.app_announcements SET is_active = p_active WHERE id = p_id;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.admin_set_announcement_active_v16(uuid, boolean, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_announcement_active_v16(uuid, boolean, text) TO authenticated, service_role;