CREATE OR REPLACE FUNCTION public.set_my_username(p_username text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  clean text;
  taken int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;

  clean := NULLIF(trim(p_username), '');
  IF clean IS NULL THEN RAISE EXCEPTION 'empty_username'; END IF;
  IF length(clean) < 3  THEN RAISE EXCEPTION 'username_too_short'; END IF;
  IF length(clean) > 24 THEN RAISE EXCEPTION 'username_too_long';  END IF;

  IF clean !~ '^[A-Za-z0-9_.\-\u0600-\u06FF]+$' THEN
    RAISE EXCEPTION 'username_invalid_chars';
  END IF;

  SELECT COUNT(*) INTO taken
    FROM public.profiles
    WHERE lower(username) = lower(clean) AND id <> uid;
  IF taken > 0 THEN RAISE EXCEPTION 'username_taken'; END IF;

  UPDATE public.profiles SET username = clean, updated_at = now() WHERE id = uid;
  RETURN clean;
END;
$function$;

REVOKE ALL    ON FUNCTION public.set_my_username(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_my_username(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.set_my_username(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_username_available(p_username text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  clean text := NULLIF(trim(p_username), '');
  hits int;
BEGIN
  IF clean IS NULL THEN RETURN false; END IF;
  IF clean !~ '^[A-Za-z0-9_.\-\u0600-\u06FF]+$' THEN RETURN false; END IF;
  IF length(clean) < 3 OR length(clean) > 24 THEN RETURN false; END IF;
  SELECT COUNT(*) INTO hits
    FROM public.profiles
    WHERE lower(username) = lower(clean) AND (uid IS NULL OR id <> uid);
  RETURN hits = 0;
END;
$function$;

REVOKE ALL    ON FUNCTION public.is_username_available(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_username_available(text) TO authenticated, anon;