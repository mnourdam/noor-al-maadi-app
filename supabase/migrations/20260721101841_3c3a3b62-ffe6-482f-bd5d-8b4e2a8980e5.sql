
-- Phase 1 — First-class campaign completion ledger.
-- Once a user legitimately completes a campaign, the fact is preserved
-- forever regardless of later admin edits (added chapters, republish,
-- restore of a previous version). Chapter-level state stays in
-- user_campaign_progress; this table records the sticky, versioned
-- "campaign X is complete for user Y" fact.

CREATE TABLE IF NOT EXISTS public.user_campaign_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  campaign_id text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  campaign_version integer,
  source text NOT NULL DEFAULT 'gameplay', -- 'gameplay' | 'migration' | 'ledger_backfill'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, campaign_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_campaign_completions TO authenticated;
GRANT ALL ON public.user_campaign_completions TO service_role;

ALTER TABLE public.user_campaign_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_completions_select"
  ON public.user_campaign_completions FOR SELECT
  TO authenticated USING (user_id = auth.uid());

CREATE POLICY "own_completions_insert"
  ON public.user_campaign_completions FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

-- Updates are strictly for reconciliation touch-ups (source/version).
CREATE POLICY "own_completions_update"
  ON public.user_campaign_completions FOR UPDATE
  TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_campaign_completions_user
  ON public.user_campaign_completions (user_id, completed_at DESC);

-- Idempotent recorder. Returns first_time=true on the first record only.
CREATE OR REPLACE FUNCTION public.record_campaign_completion(
  p_campaign_id text,
  p_campaign_version integer DEFAULT NULL,
  p_source text DEFAULT 'gameplay'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inserted boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;
  IF p_campaign_id IS NULL OR length(trim(p_campaign_id)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_campaign_id');
  END IF;

  INSERT INTO public.user_campaign_completions
    (user_id, campaign_id, campaign_version, source)
  VALUES
    (v_uid, p_campaign_id, p_campaign_version,
     COALESCE(NULLIF(trim(p_source), ''), 'gameplay'))
  ON CONFLICT (user_id, campaign_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'first_time', v_inserted,
    'campaign_id', p_campaign_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_campaign_completion(text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_user_campaign_completions_touch()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ucc_touch ON public.user_campaign_completions;
CREATE TRIGGER trg_ucc_touch
  BEFORE UPDATE ON public.user_campaign_completions
  FOR EACH ROW EXECUTE FUNCTION public.update_user_campaign_completions_touch();
