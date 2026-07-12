
-- ============================================================
-- P0 repair: sticky chapter completion in user_campaign_progress
-- ------------------------------------------------------------
-- Symptom: rows where a later chapter has completed_at set but
-- earlier chapters in the SAME campaign are NULL. Invariant #1
-- (a chapter cannot be unlocked before all earlier chapters are
-- completed) makes this impossible in valid data; the NULLs are
-- overwrites from the pre-fix regression bug.
--
-- Fix: for each (user_id, campaign_id) group, find the earliest
-- known completion timestamp. Any row in that group that has
-- score > 0 OR any completed sibling with a "greater-or-equal"
-- chapter id is restored to that timestamp.
--
-- Idempotent. Never overwrites an existing non-null completed_at.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_repair_chapter_completions_stickiness()
RETURNS TABLE(rows_repaired bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  repaired bigint := 0;
BEGIN
  -- Per (user, campaign): the max chapter_id (naturally ordered) that has
  -- a completed_at set. Every row whose chapter_id sorts <= that value must
  -- also be completed under invariant #1.
  WITH ranked AS (
    SELECT
      p.user_id,
      p.campaign_id,
      p.chapter_id,
      p.completed_at,
      -- Natural order: strip leading non-digits, cast tail to int; fall
      -- back to string ordering for anything non-numeric. Handles "ch1"
      -- vs "ch10" correctly.
      COALESCE(
        NULLIF(regexp_replace(p.chapter_id, '\D', '', 'g'), '')::int,
        NULL
      ) AS chapter_num,
      p.chapter_id AS chapter_key
    FROM public.user_campaign_progress p
  ),
  max_done AS (
    SELECT
      user_id,
      campaign_id,
      MAX(chapter_num) FILTER (WHERE completed_at IS NOT NULL) AS max_done_num,
      MAX(chapter_key) FILTER (WHERE completed_at IS NOT NULL AND chapter_num IS NULL) AS max_done_key,
      MIN(completed_at) AS earliest_done_at
    FROM ranked
    GROUP BY user_id, campaign_id
  ),
  candidates AS (
    SELECT
      r.user_id, r.campaign_id, r.chapter_id, m.earliest_done_at
    FROM ranked r
    JOIN max_done m
      ON m.user_id = r.user_id AND m.campaign_id = r.campaign_id
    WHERE r.completed_at IS NULL
      AND m.earliest_done_at IS NOT NULL
      AND (
        (r.chapter_num IS NOT NULL AND m.max_done_num IS NOT NULL AND r.chapter_num < m.max_done_num)
        OR (r.chapter_num IS NULL AND m.max_done_key IS NOT NULL AND r.chapter_key < m.max_done_key)
      )
  )
  UPDATE public.user_campaign_progress p
  SET
    completed_at = c.earliest_done_at,
    status = 'completed',
    updated_at = now()
  FROM candidates c
  WHERE p.user_id = c.user_id
    AND p.campaign_id = c.campaign_id
    AND p.chapter_id = c.chapter_id
    AND p.completed_at IS NULL;

  GET DIAGNOSTICS repaired = ROW_COUNT;
  RETURN QUERY SELECT repaired;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_repair_chapter_completions_stickiness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_repair_chapter_completions_stickiness() TO service_role;

-- Run the repair once as part of this migration.
SELECT public.admin_repair_chapter_completions_stickiness();
