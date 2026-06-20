
-- automatic_notification_runs: dedup ledger for automatic jobs
CREATE TABLE IF NOT EXISTS public.automatic_notification_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_key text NOT NULL,
  run_date date NOT NULL,
  status text NOT NULL DEFAULT 'success',
  notification_id uuid REFERENCES public.notifications(id) ON DELETE SET NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_key, run_date)
);

CREATE INDEX IF NOT EXISTS automatic_notif_runs_date_idx
  ON public.automatic_notification_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS automatic_notif_runs_job_idx
  ON public.automatic_notification_runs(job_key);

GRANT ALL ON public.automatic_notification_runs TO service_role;
GRANT SELECT ON public.automatic_notification_runs TO authenticated;

ALTER TABLE public.automatic_notification_runs ENABLE ROW LEVEL SECURITY;

-- Admins (handled via app-layer check) can read; service role bypasses RLS.
CREATE POLICY "authenticated can read automatic runs"
  ON public.automatic_notification_runs FOR SELECT TO authenticated
  USING (true);

-- daily_facts: rotating pool of historical facts
CREATE TABLE IF NOT EXISTS public.daily_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  deep_link text,
  enabled boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS daily_facts_enabled_idx ON public.daily_facts(enabled);
CREATE INDEX IF NOT EXISTS daily_facts_last_sent_idx ON public.daily_facts(last_sent_at NULLS FIRST);

GRANT ALL ON public.daily_facts TO service_role;
GRANT SELECT ON public.daily_facts TO authenticated;

ALTER TABLE public.daily_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read enabled facts"
  ON public.daily_facts FOR SELECT TO authenticated
  USING (enabled = true);
