
CREATE TABLE public.reauth_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  purpose text NOT NULL DEFAULT 'reauthentication',
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  locked_at timestamptz,
  requester_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.reauth_challenges TO service_role;

ALTER TABLE public.reauth_challenges ENABLE ROW LEVEL SECURITY;

-- Deny-all baseline: only service_role (which bypasses RLS) may touch this
-- table. No policies for anon or authenticated on purpose.
CREATE POLICY "reauth_challenges service role only"
ON public.reauth_challenges
FOR ALL
TO authenticated, anon
USING (false)
WITH CHECK (false);

CREATE INDEX reauth_challenges_user_active_idx
  ON public.reauth_challenges (user_id, purpose, created_at DESC)
  WHERE consumed_at IS NULL AND locked_at IS NULL;

CREATE INDEX reauth_challenges_expires_idx
  ON public.reauth_challenges (expires_at);

-- Hourly cleanup of stale/expired/consumed challenges older than 24h.
CREATE OR REPLACE FUNCTION public.reauth_challenges_cleanup()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  DELETE FROM public.reauth_challenges
   WHERE created_at < now() - interval '24 hours';
$$;

REVOKE ALL ON FUNCTION public.reauth_challenges_cleanup() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'reauth-challenges-cleanup-hourly',
  '7 * * * *',
  $$SELECT public.reauth_challenges_cleanup();$$
);
