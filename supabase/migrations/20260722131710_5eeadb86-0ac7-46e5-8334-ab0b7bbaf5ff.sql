
-- =====================================================================
-- Stories System — P1 (Domain & Persistence)
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 0. Stable delta-UUID helper
-- ---------------------------------------------------------------------
-- Canonical helper for deterministic profile-delta ids. Uses uuid_generate_v5
-- with a fixed namespace so the same semantic key always produces the same
-- UUID. Reused by every server RPC that grants rewards through
-- apply_profile_delta (existing callers may migrate to this helper later).
CREATE OR REPLACE FUNCTION public.stable_delta_uuid(p_key text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT uuid_generate_v5('a1b2c3d4-e5f6-4a7b-8c9d-000000000001'::uuid, p_key)
$$;

-- ---------------------------------------------------------------------
-- 1. Stories catalog
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stories (
  id                text PRIMARY KEY,                    -- stable slug/key
  slug              text NOT NULL UNIQUE,
  title_ar          text NOT NULL,
  title_en          text,
  summary_ar        text,
  summary_en        text,
  world_slug        text,
  era               text,
  display_order     integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','published','archived')),
  content_version   integer NOT NULL DEFAULT 1,
  unlock_spec       jsonb NOT NULL DEFAULT '{"type":"always"}'::jsonb,
  cover_media_id    uuid,
  xp_reward         integer NOT NULL DEFAULT 0,
  dinar_reward      integer NOT NULL DEFAULT 0,
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  published_at      timestamptz
);

CREATE INDEX IF NOT EXISTS stories_status_order_idx
  ON public.stories (status, display_order);
CREATE INDEX IF NOT EXISTS stories_world_idx
  ON public.stories (world_slug);

GRANT SELECT ON public.stories TO anon, authenticated;
GRANT ALL    ON public.stories TO service_role;

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stories_public_read_published"
  ON public.stories FOR SELECT
  USING (status = 'published');

CREATE POLICY "stories_admin_read_all"
  ON public.stories FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "stories_admin_write"
  ON public.stories FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER stories_touch_updated_at
  BEFORE UPDATE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 2. Story scenes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.story_scenes (
  id                text PRIMARY KEY,                    -- stable per-story key
  story_id          text NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  scene_index       integer NOT NULL,
  scene_type        text NOT NULL
                    CHECK (scene_type IN ('reading','perspective','document','reveal','reflection')),
  title_ar          text,
  title_en          text,
  payload           jsonb NOT NULL DEFAULT '{}'::jsonb,
  primary_media_id  uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (story_id, scene_index)
);

CREATE INDEX IF NOT EXISTS story_scenes_story_idx
  ON public.story_scenes (story_id, scene_index);

GRANT SELECT ON public.story_scenes TO anon, authenticated;
GRANT ALL    ON public.story_scenes TO service_role;

ALTER TABLE public.story_scenes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_scenes_public_read_published"
  ON public.story_scenes FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = story_scenes.story_id AND s.status = 'published'
  ));

CREATE POLICY "story_scenes_admin_read_all"
  ON public.story_scenes FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "story_scenes_admin_write"
  ON public.story_scenes FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER story_scenes_touch_updated_at
  BEFORE UPDATE ON public.story_scenes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 3. Story media identity
-- ---------------------------------------------------------------------
-- Canonical, checksum-addressed, server-verified media used by Stories.
-- Upload/verification pipeline itself lands in P2; the table exists in P1
-- so foreign keys and cover_media_id references have a valid target.
CREATE TABLE IF NOT EXISTS public.story_media (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id              text REFERENCES public.stories(id) ON DELETE SET NULL,
  kind                  text NOT NULL
                        CHECK (kind IN ('cover','scene','document','thumbnail')),
  storage_bucket        text NOT NULL,
  storage_path          text NOT NULL,
  mime_type             text NOT NULL DEFAULT 'image/webp',
  byte_size             integer NOT NULL,
  width                 integer NOT NULL,
  height                integer NOT NULL,
  checksum_sha256       text NOT NULL,
  preset                text NOT NULL,                   -- e.g. 'story.cover.v1'
  processing_version    integer NOT NULL DEFAULT 1,
  verified              boolean NOT NULL DEFAULT false,
  verified_at           timestamptz,
  verified_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path),
  UNIQUE (checksum_sha256, preset, processing_version)
);

CREATE INDEX IF NOT EXISTS story_media_story_idx
  ON public.story_media (story_id, kind);

GRANT SELECT ON public.story_media TO anon, authenticated;
GRANT ALL    ON public.story_media TO service_role;

ALTER TABLE public.story_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "story_media_public_read_verified"
  ON public.story_media FOR SELECT
  USING (verified = true);

CREATE POLICY "story_media_admin_read_all"
  ON public.story_media FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "story_media_admin_write"
  ON public.story_media FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER story_media_touch_updated_at
  BEFORE UPDATE ON public.story_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.stories
  ADD CONSTRAINT stories_cover_media_fk
  FOREIGN KEY (cover_media_id) REFERENCES public.story_media(id) ON DELETE SET NULL;

ALTER TABLE public.story_scenes
  ADD CONSTRAINT story_scenes_primary_media_fk
  FOREIGN KEY (primary_media_id) REFERENCES public.story_media(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------
-- 4. Per-user progress
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_story_progress (
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id                  text NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  last_scene_index          integer NOT NULL DEFAULT 0,
  max_scene_index_reached   integer NOT NULL DEFAULT 0,
  content_version_seen      integer NOT NULL DEFAULT 1,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id)
);

CREATE INDEX IF NOT EXISTS user_story_progress_user_updated_idx
  ON public.user_story_progress (user_id, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_story_progress TO authenticated;
GRANT ALL ON public.user_story_progress TO service_role;

ALTER TABLE public.user_story_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_story_progress_owner_read"
  ON public.user_story_progress FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_story_progress_owner_write"
  ON public.user_story_progress FOR ALL
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER user_story_progress_touch_updated_at
  BEFORE UPDATE ON public.user_story_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 5. Per-user completions (sticky)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_story_completions (
  user_id                             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  story_id                            text NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  first_completed_at                  timestamptz NOT NULL DEFAULT now(),
  content_version_at_completion       integer NOT NULL,
  reward_delta_id                     uuid NOT NULL,
  reward_xp                           integer NOT NULL DEFAULT 0,
  reward_dinars                       integer NOT NULL DEFAULT 0,
  metadata                            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                          timestamptz NOT NULL DEFAULT now(),
  updated_at                          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id)
);

CREATE INDEX IF NOT EXISTS user_story_completions_user_first_idx
  ON public.user_story_completions (user_id, first_completed_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.user_story_completions TO authenticated;
GRANT ALL ON public.user_story_completions TO service_role;

ALTER TABLE public.user_story_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_story_completions_owner_read"
  ON public.user_story_completions FOR SELECT
  TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "user_story_completions_owner_insert"
  ON public.user_story_completions FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
-- No UPDATE / DELETE policy for authenticated: completions are sticky.

CREATE TRIGGER user_story_completions_touch_updated_at
  BEFORE UPDATE ON public.user_story_completions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------
-- 6. Reflection scope — staged safe migration
-- ---------------------------------------------------------------------
-- Step 1: nullable compatibility columns
ALTER TABLE public.user_reflections
  ADD COLUMN IF NOT EXISTS source_type text,
  ADD COLUMN IF NOT EXISTS source_id   text,
  ADD COLUMN IF NOT EXISTS context_id  text;

-- Step 2: backfill existing rows (all current rows are campaign reflections)
UPDATE public.user_reflections
   SET source_type = COALESCE(source_type, 'campaign'),
       source_id   = COALESCE(source_id,   campaign_id),
       context_id  = COALESCE(context_id,  activity_id)
 WHERE source_type IS NULL
    OR source_id   IS NULL
    OR context_id  IS NULL;

-- Step 3: validate — fail loudly if backfill left gaps or duplicates
DO $$
DECLARE
  v_null   integer;
  v_dupes  integer;
BEGIN
  SELECT count(*) INTO v_null
    FROM public.user_reflections
   WHERE source_type IS NULL OR source_id IS NULL OR context_id IS NULL;
  IF v_null > 0 THEN
    RAISE EXCEPTION 'reflection backfill left % null scoped identities', v_null;
  END IF;

  SELECT count(*) INTO v_dupes FROM (
    SELECT 1
      FROM public.user_reflections
     GROUP BY user_id, source_type, source_id, context_id
    HAVING count(*) > 1
  ) d;
  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'reflection backfill produced % duplicate scoped keys', v_dupes;
  END IF;
END $$;

-- Step 4: scoped unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS user_reflections_unique_scope
  ON public.user_reflections (user_id, source_type, source_id, context_id);

-- Step 5: mark new columns NOT NULL now that data is clean
ALTER TABLE public.user_reflections
  ALTER COLUMN source_type SET NOT NULL,
  ALTER COLUMN source_id   SET NOT NULL,
  ALTER COLUMN context_id  SET NOT NULL;

-- Compatibility: legacy campaign_id / activity_id columns remain populated for
-- the current client. A follow-up migration will drop them once every
-- read/write path has cut over to (source_type, source_id, context_id).

-- Ensure new source_type values from Stories & other sources are allowed.
ALTER TABLE public.user_reflections
  ADD CONSTRAINT user_reflections_source_type_check
  CHECK (source_type IN ('campaign','story','investigation'));

-- ---------------------------------------------------------------------
-- 7. Unlock evaluator
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_unlock_spec(p_user_id uuid, p_spec jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_child jsonb;
  v_ok boolean;
BEGIN
  IF p_spec IS NULL THEN RETURN true; END IF;
  v_type := p_spec->>'type';
  IF v_type IS NULL OR v_type = 'always' THEN
    RETURN true;
  ELSIF v_type = 'and' THEN
    FOR v_child IN SELECT jsonb_array_elements(COALESCE(p_spec->'children','[]'::jsonb)) LOOP
      IF NOT public.evaluate_unlock_spec(p_user_id, v_child) THEN RETURN false; END IF;
    END LOOP;
    RETURN true;
  ELSIF v_type = 'or' THEN
    FOR v_child IN SELECT jsonb_array_elements(COALESCE(p_spec->'children','[]'::jsonb)) LOOP
      IF public.evaluate_unlock_spec(p_user_id, v_child) THEN RETURN true; END IF;
    END LOOP;
    RETURN false;
  ELSIF v_type = 'campaign_completed' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_campaign_completions
       WHERE user_id = p_user_id
         AND campaign_id = p_spec->>'campaign_id'
    );
  ELSIF v_type = 'investigation_completed' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_investigation_progress
       WHERE user_id = p_user_id
         AND investigation_id::text = p_spec->>'investigation_id'
         AND completed_at IS NOT NULL
    );
  ELSIF v_type = 'story_completed' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.user_story_completions
       WHERE user_id = p_user_id
         AND story_id = p_spec->>'story_id'
    );
  END IF;
  RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION public.evaluate_unlock_spec(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- 8. Story access RPC (returns full bundle if visible + unlocked)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_story_access(p_story_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_story public.stories%ROWTYPE;
  v_is_admin boolean := false;
  v_unlocked boolean := false;
BEGIN
  SELECT * INTO v_story FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_uid IS NOT NULL THEN
    v_is_admin := public.has_role(v_uid, 'admin');
  END IF;

  IF v_story.status <> 'published' AND NOT v_is_admin THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_published');
  END IF;

  IF v_uid IS NULL THEN
    v_unlocked := (v_story.unlock_spec->>'type') IS NULL
               OR (v_story.unlock_spec->>'type') = 'always';
  ELSE
    v_unlocked := public.evaluate_unlock_spec(v_uid, v_story.unlock_spec);
  END IF;

  IF NOT v_unlocked AND NOT v_is_admin THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked',
      'story', to_jsonb(v_story) - 'unlock_spec');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'story', to_jsonb(v_story),
    'scenes', COALESCE((
      SELECT jsonb_agg(to_jsonb(sc) ORDER BY sc.scene_index)
        FROM public.story_scenes sc
       WHERE sc.story_id = v_story.id
    ), '[]'::jsonb),
    'progress', (
      SELECT to_jsonb(p) FROM public.user_story_progress p
       WHERE p.user_id = v_uid AND p.story_id = v_story.id
    ),
    'completed', EXISTS (
      SELECT 1 FROM public.user_story_completions c
       WHERE c.user_id = v_uid AND c.story_id = v_story.id
    )
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_story_access(text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. Monotonic per-scene progress RPC
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_story_progress_v2(
  p_story_id text,
  p_scene_index integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_story public.stories%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF p_story_id IS NULL OR length(p_story_id) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_story_id');
  END IF;
  IF p_scene_index IS NULL OR p_scene_index < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_scene_index');
  END IF;

  SELECT * INTO v_story FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'story_not_found');
  END IF;

  INSERT INTO public.user_story_progress AS p
    (user_id, story_id, last_scene_index, max_scene_index_reached, content_version_seen)
    VALUES (v_uid, p_story_id, p_scene_index, p_scene_index, v_story.content_version)
    ON CONFLICT (user_id, story_id) DO UPDATE
      SET last_scene_index        = GREATEST(p.last_scene_index, EXCLUDED.last_scene_index),
          max_scene_index_reached = GREATEST(p.max_scene_index_reached, EXCLUDED.last_scene_index),
          content_version_seen    = EXCLUDED.content_version_seen,
          updated_at              = now();

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.record_story_progress_v2(text, integer) TO authenticated;

-- ---------------------------------------------------------------------
-- 10. Sticky completion + reward RPC
-- ---------------------------------------------------------------------
-- Reward identity is `story_completion:<user_id>:<story_id>` — independent
-- of content_version. Concurrency safety: the completion INSERT uses
-- ON CONFLICT DO NOTHING (sticky), and apply_profile_delta uses the
-- applied_profile_deltas primary key on delta_id to prevent double-grant.
CREATE OR REPLACE FUNCTION public.complete_story_v2(
  p_story_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_story public.stories%ROWTYPE;
  v_delta_id uuid;
  v_inserted boolean := false;
  v_first_completed_at timestamptz;
  v_reward_xp integer;
  v_reward_dinars integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF p_story_id IS NULL OR length(p_story_id) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_story_id');
  END IF;

  SELECT * INTO v_story FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'story_not_found');
  END IF;
  IF v_story.status <> 'published' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_published');
  END IF;

  -- Version-independent stable reward identity.
  v_delta_id := public.stable_delta_uuid('story_completion:' || v_uid::text || ':' || p_story_id);

  INSERT INTO public.user_story_completions AS c
    (user_id, story_id, content_version_at_completion, reward_delta_id,
     reward_xp, reward_dinars)
    VALUES (v_uid, p_story_id, v_story.content_version, v_delta_id,
            v_story.xp_reward, v_story.dinar_reward)
    ON CONFLICT (user_id, story_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT first_completed_at, reward_xp, reward_dinars
    INTO v_first_completed_at, v_reward_xp, v_reward_dinars
    FROM public.user_story_completions
   WHERE user_id = v_uid AND story_id = p_story_id;

  IF v_inserted = false THEN
    -- Already completed at some earlier version. Never grant a second reward.
    RETURN jsonb_build_object(
      'ok', true, 'first_completion', false,
      'first_completed_at', v_first_completed_at,
      'reward_delta_id', v_delta_id,
      'reward_granted_xp', 0, 'reward_granted_dinars', 0
    );
  END IF;

  -- First-time completion path: grant rewards through the idempotent ledger.
  -- apply_profile_delta uses applied_profile_deltas PK to prevent duplicates
  -- even under two simultaneous first-completion attempts.
  PERFORM public.apply_profile_delta(
    v_delta_id,
    COALESCE(v_reward_xp, 0),
    COALESCE(v_reward_dinars, 0),
    0,
    'story_completion:' || p_story_id
  );

  RETURN jsonb_build_object(
    'ok', true, 'first_completion', true,
    'first_completed_at', v_first_completed_at,
    'reward_delta_id', v_delta_id,
    'reward_granted_xp', COALESCE(v_reward_xp, 0),
    'reward_granted_dinars', COALESCE(v_reward_dinars, 0),
    'content_version_at_completion', v_story.content_version
  );
END $$;

GRANT EXECUTE ON FUNCTION public.complete_story_v2(text) TO authenticated;
