-- ============================================================
-- V17-04B REPAIR (PREPARED — NOT EXECUTED)
-- Re-derives the streak mirror from the ledger only.
-- No invented days, no backfill, no GREATEST, no preservation of
-- inflated values. The ledger wins. Idempotent: running it twice
-- produces the same result.
-- ============================================================

-- ---------- (A) READ-ONLY DIVERGENCE REPORT — run this first ----------
-- Lists only ids and numbers; no names, emails or other personal data.
WITH d AS (
  SELECT
    user_id,
    activity_day,
    (activity_day - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY activity_day))::int) AS grp
  FROM public.user_streak_days
), runs AS (
  SELECT user_id, grp, COUNT(*)::int AS run_len, MAX(activity_day) AS run_end
  FROM d GROUP BY user_id, grp
), current_run AS (
  SELECT DISTINCT ON (user_id) user_id, run_len AS ledger_streak, run_end AS last_ledger_day
  FROM runs ORDER BY user_id, run_end DESC
)
SELECT
  p.id                        AS user_id,
  p.streak                    AS profile_streak,
  p.longest_streak            AS profile_longest_streak,
  p.last_streak_day           AS profile_last_streak_day,
  COALESCE(c.ledger_streak, 0) AS ledger_streak,
  c.last_ledger_day           AS last_ledger_day,
  (p.streak IS DISTINCT FROM COALESCE(c.ledger_streak, 0)
   OR p.last_streak_day IS DISTINCT FROM c.last_ledger_day) AS differs
FROM public.profiles p
LEFT JOIN current_run c ON c.user_id = p.id
WHERE p.streak IS DISTINCT FROM COALESCE(c.ledger_streak, 0)
   OR p.last_streak_day IS DISTINCT FROM c.last_ledger_day
ORDER BY differs DESC, p.id;

-- ---------- (B) REPAIR — DO NOT RUN UNTIL V17-04B IS APPROVED ----------
-- Updates ONLY: profiles.streak, profiles.last_streak_day.
-- Rows with no ledger history at all are set to streak = 0 and
-- last_streak_day = NULL (that is exactly what the ledger says).
--
-- longest_streak is DELIBERATELY LEFT UNTOUCHED. The ledger only exists
-- from the V16 rollout onward, so it cannot prove pre-ledger history;
-- re-deriving longest_streak from an incomplete ledger could LOWER a
-- legitimately earned all-time record. It can only be reconstructed
-- safely once the ledger is known to cover a player's whole lifetime.
--
-- WITH d AS (
--   SELECT user_id, activity_day,
--          (activity_day - (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY activity_day))::int) AS grp
--   FROM public.user_streak_days
-- ), runs AS (
--   SELECT user_id, grp, COUNT(*)::int AS run_len, MAX(activity_day) AS run_end
--   FROM d GROUP BY user_id, grp
-- ), current_run AS (
--   SELECT DISTINCT ON (user_id) user_id, run_len AS ledger_streak, run_end AS last_ledger_day
--   FROM runs ORDER BY user_id, run_end DESC
-- )
-- UPDATE public.profiles p
--    SET streak          = COALESCE(c.ledger_streak, 0),
--        last_streak_day = c.last_ledger_day
--   FROM (SELECT p2.id, c2.ledger_streak, c2.last_ledger_day
--           FROM public.profiles p2
--           LEFT JOIN current_run c2 ON c2.user_id = p2.id) c
--  WHERE c.id = p.id
--    AND (p.streak IS DISTINCT FROM COALESCE(c.ledger_streak, 0)
--         OR p.last_streak_day IS DISTINCT FROM c.last_ledger_day);
