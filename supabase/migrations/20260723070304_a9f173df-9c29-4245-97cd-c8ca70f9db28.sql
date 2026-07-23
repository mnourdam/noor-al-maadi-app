
-- ============================================================
-- Journey Log (Step 4) — derived per-user timeline
-- ------------------------------------------------------------
-- Read-only. No new tables. No triggers. Six source projections
-- unioned into one canonical event shape. Keyset paginated.
-- ============================================================

-- Canonical event kinds. Additive: future kinds MUST be added
-- here and to the UNION below, never mutated in place.
DO $$ BEGIN
  CREATE TYPE public.journey_event_kind AS ENUM (
    'story_completed',
    'campaign_completed',
    'investigation_completed',
    'achievement_earned',
    'encyclopedia_discovery',
    'museum_discovery'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- list_my_journey — paginated timeline for the caller.
-- Deterministic sort: (occurred_at DESC, event_id DESC).
-- Keyset: pass the last row's (occurred_at, event_id).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_my_journey(
  public.journey_event_kind[], timestamptz, text, integer
);

CREATE OR REPLACE FUNCTION public.list_my_journey(
  _kinds        public.journey_event_kind[] DEFAULT NULL,
  _cursor_ts    timestamptz                 DEFAULT NULL,
  _cursor_id    text                        DEFAULT NULL,
  _limit        integer                     DEFAULT 30
)
RETURNS TABLE (
  event_id     text,
  kind         public.journey_event_kind,
  occurred_at  timestamptz,
  subject_id   text,
  subject_type text,
  metadata     jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  cap integer := GREATEST(1, LEAST(COALESCE(_limit, 30), 100));
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH events AS (
    -- 1) Story completions
    SELECT
      ('story:' || sc.story_id || ':' || extract(epoch from sc.first_completed_at)::text)::text AS event_id,
      'story_completed'::public.journey_event_kind AS kind,
      sc.first_completed_at AS occurred_at,
      sc.story_id::text AS subject_id,
      'story'::text AS subject_type,
      jsonb_strip_nulls(jsonb_build_object(
        'content_version', sc.content_version_at_completion,
        'reward_xp',       sc.reward_xp,
        'reward_dinars',   sc.reward_dinars
      )) AS metadata
    FROM public.user_story_completions sc
    WHERE sc.user_id = uid AND sc.first_completed_at IS NOT NULL

    UNION ALL

    -- 2) Campaign completions
    SELECT
      ('campaign:' || cc.campaign_id || ':' || extract(epoch from cc.completed_at)::text)::text,
      'campaign_completed'::public.journey_event_kind,
      cc.completed_at,
      cc.campaign_id::text,
      'campaign'::text,
      jsonb_strip_nulls(jsonb_build_object(
        'campaign_version', cc.campaign_version,
        'source',           cc.source
      ))
    FROM public.user_campaign_completions cc
    WHERE cc.user_id = uid AND cc.completed_at IS NOT NULL

    UNION ALL

    -- 3) Investigation completions
    SELECT
      ('investigation:' || ip.investigation_id::text || ':' || extract(epoch from ip.completed_at)::text)::text,
      'investigation_completed'::public.journey_event_kind,
      ip.completed_at,
      ip.investigation_id::text,
      'investigation'::text,
      jsonb_strip_nulls(jsonb_build_object(
        'score',            ip.score,
        'correct_count',    ip.correct_count,
        'xp_earned',        ip.xp_earned,
        'dinars_earned',    ip.dinars_earned,
        'artifact_awarded', ip.artifact_awarded,
        'badge_awarded',    ip.badge_awarded
      ))
    FROM public.user_investigation_progress ip
    WHERE ip.user_id = uid
      AND ip.status = 'completed'
      AND ip.completed_at IS NOT NULL

    UNION ALL

    -- 4) Achievements earned
    SELECT
      ('achievement:' || ua.achievement_id || ':' || extract(epoch from ua.unlocked_at)::text)::text,
      'achievement_earned'::public.journey_event_kind,
      ua.unlocked_at,
      ua.achievement_id::text,
      'achievement'::text,
      jsonb_strip_nulls(jsonb_build_object(
        'definition_version', ua.definition_version,
        'engine_version',     ua.engine_version
      ))
    FROM public.user_achievements ua
    WHERE ua.user_id = uid AND ua.unlocked_at IS NOT NULL

    UNION ALL

    -- 5) Encyclopedia discoveries (Atlas / Encyclopedia entities)
    SELECT
      ('entity:' || ed.entity_id::text || ':' || extract(epoch from ed.first_discovered_at)::text)::text,
      'encyclopedia_discovery'::public.journey_event_kind,
      ed.first_discovered_at,
      ed.entity_id::text,
      ed.entity_type::text,
      jsonb_strip_nulls(jsonb_build_object(
        'entity_slug', ed.entity_slug,
        'source',      ed.source
      ))
    FROM public.user_entity_discoveries ed
    WHERE ed.user_id = uid AND ed.first_discovered_at IS NOT NULL

    UNION ALL

    -- 6) Museum discoveries (user_collection)
    SELECT
      ('museum:' || uc.item_type || ':' || uc.item_id || ':' || extract(epoch from uc.unlocked_at)::text)::text,
      'museum_discovery'::public.journey_event_kind,
      uc.unlocked_at,
      uc.item_id::text,
      uc.item_type::text,
      jsonb_strip_nulls(jsonb_build_object(
        'source_campaign_id', uc.source_campaign_id,
        'source_chapter_id',  uc.source_chapter_id
      ))
    FROM public.user_collection uc
    WHERE uc.user_id = uid AND uc.unlocked_at IS NOT NULL
  )
  SELECT e.event_id, e.kind, e.occurred_at, e.subject_id, e.subject_type, e.metadata
  FROM events e
  WHERE (_kinds IS NULL OR e.kind = ANY(_kinds))
    AND (
      _cursor_ts IS NULL
      OR e.occurred_at < _cursor_ts
      OR (e.occurred_at = _cursor_ts AND (_cursor_id IS NULL OR e.event_id < _cursor_id))
    )
  ORDER BY e.occurred_at DESC, e.event_id DESC
  LIMIT cap;
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_journey(public.journey_event_kind[], timestamptz, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_journey(public.journey_event_kind[], timestamptz, text, integer) TO authenticated;

-- ------------------------------------------------------------
-- journey_kind_counts — per-kind lifetime totals for filter chips.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.journey_kind_counts();

CREATE OR REPLACE FUNCTION public.journey_kind_counts()
RETURNS TABLE (kind public.journey_event_kind, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH uid AS (SELECT auth.uid() AS u)
  SELECT k, total FROM (
    SELECT 'story_completed'::public.journey_event_kind AS k,
           (SELECT count(*) FROM public.user_story_completions
              WHERE user_id = (SELECT u FROM uid) AND first_completed_at IS NOT NULL) AS total
    UNION ALL
    SELECT 'campaign_completed'::public.journey_event_kind,
           (SELECT count(*) FROM public.user_campaign_completions
              WHERE user_id = (SELECT u FROM uid) AND completed_at IS NOT NULL)
    UNION ALL
    SELECT 'investigation_completed'::public.journey_event_kind,
           (SELECT count(*) FROM public.user_investigation_progress
              WHERE user_id = (SELECT u FROM uid) AND status = 'completed' AND completed_at IS NOT NULL)
    UNION ALL
    SELECT 'achievement_earned'::public.journey_event_kind,
           (SELECT count(*) FROM public.user_achievements
              WHERE user_id = (SELECT u FROM uid) AND unlocked_at IS NOT NULL)
    UNION ALL
    SELECT 'encyclopedia_discovery'::public.journey_event_kind,
           (SELECT count(*) FROM public.user_entity_discoveries
              WHERE user_id = (SELECT u FROM uid) AND first_discovered_at IS NOT NULL)
    UNION ALL
    SELECT 'museum_discovery'::public.journey_event_kind,
           (SELECT count(*) FROM public.user_collection
              WHERE user_id = (SELECT u FROM uid) AND unlocked_at IS NOT NULL)
  ) s
  WHERE (SELECT u FROM uid) IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.journey_kind_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.journey_kind_counts() TO authenticated;
