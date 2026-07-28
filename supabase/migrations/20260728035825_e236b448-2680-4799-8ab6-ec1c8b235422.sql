-- 1) Stable dedupe key on notifications.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

-- Clean any pre-existing exact duplicates before the unique index.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_uidx
  ON public.notifications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- 2) One run row per (job_key, run_date) — makes the automatic-notification
--    runner's "already ran" check atomic instead of check-then-act.
DELETE FROM public.automatic_notification_runs a
USING public.automatic_notification_runs b
WHERE a.job_key = b.job_key
  AND a.run_date = b.run_date
  AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS automatic_notification_runs_job_date_uidx
  ON public.automatic_notification_runs (job_key, run_date);