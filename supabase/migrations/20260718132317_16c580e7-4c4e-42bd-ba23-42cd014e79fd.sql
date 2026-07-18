-- ============================================================
-- Phase G1 hardening: derive profiles.investigations_completed
-- from user_investigation_progress. Never client-written.
-- profiles PK is `id` (= auth.users.id).
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_investigations_completed_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := COALESCE(NEW.user_id, OLD.user_id);
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.profiles
     SET investigations_completed = (
       SELECT COUNT(*)::int
         FROM public.user_investigation_progress
        WHERE user_id = v_uid
          AND status = 'completed'
     )
   WHERE id = v_uid;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_investigations_completed
  ON public.user_investigation_progress;

CREATE TRIGGER trg_sync_investigations_completed
AFTER INSERT OR UPDATE OF status OR DELETE
ON public.user_investigation_progress
FOR EACH ROW
EXECUTE FUNCTION public.sync_investigations_completed_count();

-- One-time backfill so the derived counter matches server truth for
-- every existing profile.
UPDATE public.profiles p
   SET investigations_completed = COALESCE(sub.cnt, 0)
  FROM (
    SELECT user_id, COUNT(*)::int AS cnt
      FROM public.user_investigation_progress
     WHERE status = 'completed'
     GROUP BY user_id
  ) sub
 WHERE sub.user_id = p.id
   AND p.investigations_completed IS DISTINCT FROM COALESCE(sub.cnt, 0);

-- Zero out any profile with no completions but a stale non-zero counter.
UPDATE public.profiles p
   SET investigations_completed = 0
 WHERE p.investigations_completed <> 0
   AND NOT EXISTS (
     SELECT 1 FROM public.user_investigation_progress uip
      WHERE uip.user_id = p.id AND uip.status = 'completed'
   );

COMMENT ON COLUMN public.profiles.investigations_completed IS
  'Derived counter maintained automatically by trg_sync_investigations_completed on public.user_investigation_progress. Never written by client code. Admin/reporting reads only.';
