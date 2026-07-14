
CREATE TABLE IF NOT EXISTS public.identity_link_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

GRANT SELECT, INSERT ON public.identity_link_audit TO authenticated;
GRANT ALL ON public.identity_link_audit TO service_role;

ALTER TABLE public.identity_link_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_read"
  ON public.identity_link_audit FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "own_insert"
  ON public.identity_link_audit FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Idempotent audit + first-time detector. Returns whether this call was the
-- first successful audit for (user, provider). Safe to call on every sign-in.
CREATE OR REPLACE FUNCTION public.record_identity_link(p_provider text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  v_provider text := lower(trim(coalesce(p_provider, '')));
  v_inserted boolean;
  v_first_link_of_second_identity boolean := false;
  v_identity_count int := 0;
  v_has_email_identity boolean := false;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF v_provider = '' THEN RAISE EXCEPTION 'invalid_provider'; END IF;

  SELECT count(*)::int,
         bool_or(provider = 'email')
    INTO v_identity_count, v_has_email_identity
    FROM auth.identities WHERE user_id = uid;

  INSERT INTO public.identity_link_audit(user_id, provider)
  VALUES (uid, v_provider)
  ON CONFLICT (user_id, provider) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- "First link" only means something when there was a pre-existing
  -- non-target identity (e.g. email/password) that this provider was just
  -- attached to. A brand-new google-only signup is not a link.
  v_first_link_of_second_identity :=
    v_inserted
    AND v_identity_count >= 2
    AND v_has_email_identity
    AND v_provider <> 'email';

  RETURN jsonb_build_object(
    'first_time_link', v_first_link_of_second_identity,
    'audited', v_inserted,
    'identity_count', v_identity_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_identity_link(text) TO authenticated;
