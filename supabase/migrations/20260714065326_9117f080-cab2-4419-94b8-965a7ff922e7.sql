
-- Admin helper: is caller admin/owner?
CREATE OR REPLACE FUNCTION public.is_newsletter_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin','owner')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_newsletter_admin() TO authenticated;

-- Stats
CREATE OR REPLACE FUNCTION public.admin_newsletter_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.is_newsletter_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total', COUNT(*),
    'active', COUNT(*) FILTER (
      WHERE ns.subscribed
        AND ns.confirmed
        AND ns.unsubscribed_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.suppressed_emails s WHERE lower(s.email) = ns.email_normalized)
    ),
    'confirmed', COUNT(*) FILTER (WHERE ns.confirmed),
    'unconfirmed', COUNT(*) FILTER (WHERE NOT ns.confirmed AND ns.unsubscribed_at IS NULL),
    'unsubscribed', COUNT(*) FILTER (WHERE ns.unsubscribed_at IS NOT NULL),
    'anonymous', COUNT(*) FILTER (WHERE ns.user_id IS NULL),
    'authenticated', COUNT(*) FILTER (WHERE ns.user_id IS NOT NULL),
    'last7', COUNT(*) FILTER (WHERE ns.created_at >= now() - interval '7 days'),
    'last30', COUNT(*) FILTER (WHERE ns.created_at >= now() - interval '30 days'),
    'suppressed', (SELECT COUNT(*) FROM public.suppressed_emails)
  ) INTO result
  FROM public.newsletter_subscribers ns;

  RETURN result;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_newsletter_stats() TO authenticated;

-- List
CREATE OR REPLACE FUNCTION public.admin_list_newsletter_subscribers(
  p_filter text DEFAULT 'all',        -- all|active|confirmed|unconfirmed|unsubscribed|anonymous|authenticated|suppressed
  p_search text DEFAULT NULL,          -- email or user_id substring
  p_source text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to   timestamptz DEFAULT NULL,
  p_limit int DEFAULT 200,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  email text,
  user_id uuid,
  subscribed boolean,
  confirmed boolean,
  source text,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  is_suppressed boolean,
  suppression_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_newsletter_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ns.id, ns.email, ns.user_id, ns.subscribed, ns.confirmed, ns.source,
         ns.confirmed_at, ns.unsubscribed_at, ns.created_at, ns.updated_at,
         (se.email IS NOT NULL) AS is_suppressed,
         se.reason AS suppression_reason
  FROM public.newsletter_subscribers ns
  LEFT JOIN public.suppressed_emails se ON lower(se.email) = ns.email_normalized
  WHERE
    (p_source IS NULL OR ns.source = p_source)
    AND (p_from IS NULL OR ns.created_at >= p_from)
    AND (p_to   IS NULL OR ns.created_at <  p_to)
    AND (p_search IS NULL OR ns.email_normalized ILIKE '%' || lower(p_search) || '%'
                          OR (ns.user_id IS NOT NULL AND ns.user_id::text ILIKE '%' || p_search || '%'))
    AND (
      p_filter = 'all'
      OR (p_filter = 'active' AND ns.subscribed AND ns.confirmed AND ns.unsubscribed_at IS NULL AND se.email IS NULL)
      OR (p_filter = 'confirmed' AND ns.confirmed)
      OR (p_filter = 'unconfirmed' AND NOT ns.confirmed AND ns.unsubscribed_at IS NULL)
      OR (p_filter = 'unsubscribed' AND ns.unsubscribed_at IS NOT NULL)
      OR (p_filter = 'anonymous' AND ns.user_id IS NULL)
      OR (p_filter = 'authenticated' AND ns.user_id IS NOT NULL)
      OR (p_filter = 'suppressed' AND se.email IS NOT NULL)
    )
  ORDER BY ns.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 1000))
  OFFSET GREATEST(0, p_offset);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_list_newsletter_subscribers(text,text,text,timestamptz,timestamptz,int,int) TO authenticated;

-- Unsubscribe
CREATE OR REPLACE FUNCTION public.admin_unsubscribe_newsletter(p_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_email text;
  target public.newsletter_subscribers%ROWTYPE;
BEGIN
  IF NOT public.is_newsletter_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.newsletter_subscribers
     SET subscribed = false,
         unsubscribed_at = COALESCE(unsubscribed_at, now()),
         updated_at = now()
   WHERE id = p_id
  RETURNING * INTO target;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT email INTO actor_email FROM auth.users WHERE id = actor;

  INSERT INTO public.admin_audit_log(actor_id, actor_email, action, target_user_id, detail, reason)
  VALUES (actor, actor_email, 'newsletter.unsubscribe', target.user_id,
          jsonb_build_object('subscriber_id', target.id, 'email_masked', left(target.email,1)||'***'), p_reason);

  RETURN jsonb_build_object('ok', true, 'id', target.id);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_unsubscribe_newsletter(uuid, text) TO authenticated;

-- Resubscribe (requires explicit consent evidence text)
CREATE OR REPLACE FUNCTION public.admin_resubscribe_newsletter(p_id uuid, p_consent_evidence text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid := auth.uid();
  actor_email text;
  target public.newsletter_subscribers%ROWTYPE;
BEGIN
  IF NOT public.is_newsletter_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_consent_evidence IS NULL OR length(trim(p_consent_evidence)) < 8 THEN
    RAISE EXCEPTION 'consent_evidence_required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.newsletter_subscribers
     SET subscribed = true,
         unsubscribed_at = NULL,
         updated_at = now()
   WHERE id = p_id
  RETURNING * INTO target;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT email INTO actor_email FROM auth.users WHERE id = actor;

  INSERT INTO public.admin_audit_log(actor_id, actor_email, action, target_user_id, detail, reason)
  VALUES (actor, actor_email, 'newsletter.resubscribe', target.user_id,
          jsonb_build_object('subscriber_id', target.id, 'email_masked', left(target.email,1)||'***', 'consent', left(p_consent_evidence, 200)), NULL);

  RETURN jsonb_build_object('ok', true, 'id', target.id);
END $$;

GRANT EXECUTE ON FUNCTION public.admin_resubscribe_newsletter(uuid, text) TO authenticated;
