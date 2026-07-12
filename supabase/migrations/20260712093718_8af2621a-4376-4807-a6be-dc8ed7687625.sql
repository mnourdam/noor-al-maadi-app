
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  email_normalized text GENERATED ALWAYS AS (lower(email)) STORED,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  subscribed boolean NOT NULL DEFAULT false,
  confirmed boolean NOT NULL DEFAULT false,
  source text,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_uniq
  ON public.newsletter_subscribers(email_normalized);
CREATE INDEX IF NOT EXISTS newsletter_subscribers_user_id_idx
  ON public.newsletter_subscribers(user_id);

GRANT SELECT, INSERT, UPDATE ON public.newsletter_subscribers TO authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;

ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own newsletter subscription" ON public.newsletter_subscribers;
CREATE POLICY "Users can view own newsletter subscription"
  ON public.newsletter_subscribers FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own newsletter subscription" ON public.newsletter_subscribers;
CREATE POLICY "Users can insert own newsletter subscription"
  ON public.newsletter_subscribers FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own newsletter subscription" ON public.newsletter_subscribers;
CREATE POLICY "Users can update own newsletter subscription"
  ON public.newsletter_subscribers FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.newsletter_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS newsletter_subscribers_touch_updated_at ON public.newsletter_subscribers;
CREATE TRIGGER newsletter_subscribers_touch_updated_at
  BEFORE UPDATE ON public.newsletter_subscribers
  FOR EACH ROW EXECUTE FUNCTION public.newsletter_touch_updated_at();

CREATE OR REPLACE FUNCTION public.get_my_newsletter_subscription()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  uid uuid := auth.uid();
  v_email text;
  row_data public.newsletter_subscribers%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = uid;
  SELECT * INTO row_data FROM public.newsletter_subscribers
    WHERE user_id = uid
       OR (v_email IS NOT NULL AND email_normalized = lower(v_email))
    ORDER BY (user_id = uid) DESC, created_at ASC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'subscribed', false,
      'confirmed', false,
      'email', v_email
    );
  END IF;
  RETURN jsonb_build_object(
    'id', row_data.id,
    'email', row_data.email,
    'subscribed', row_data.subscribed,
    'confirmed', row_data.confirmed,
    'source', row_data.source,
    'confirmed_at', row_data.confirmed_at,
    'unsubscribed_at', row_data.unsubscribed_at,
    'updated_at', row_data.updated_at
  );
END $$;

CREATE OR REPLACE FUNCTION public.set_my_newsletter_subscription(
  p_subscribed boolean,
  p_source text DEFAULT 'account_settings'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  uid uuid := auth.uid();
  v_email text;
  existing public.newsletter_subscribers%ROWTYPE;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = uid;
  IF v_email IS NULL THEN RAISE EXCEPTION 'no_email_on_account'; END IF;

  SELECT * INTO existing FROM public.newsletter_subscribers
    WHERE email_normalized = lower(v_email) LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.newsletter_subscribers (email, user_id, subscribed, source, unsubscribed_at)
    VALUES (
      v_email, uid, COALESCE(p_subscribed, false), p_source,
      CASE WHEN COALESCE(p_subscribed, false) THEN NULL ELSE now() END
    );
  ELSE
    UPDATE public.newsletter_subscribers
       SET subscribed = COALESCE(p_subscribed, false),
           user_id = COALESCE(user_id, uid),
           source = COALESCE(source, p_source),
           unsubscribed_at = CASE
             WHEN COALESCE(p_subscribed, false) THEN NULL
             ELSE COALESCE(unsubscribed_at, now())
           END,
           updated_at = now()
     WHERE id = existing.id;
  END IF;

  RETURN public.get_my_newsletter_subscription();
END $$;

GRANT EXECUTE ON FUNCTION public.get_my_newsletter_subscription() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_newsletter_subscription(boolean, text) TO authenticated;
