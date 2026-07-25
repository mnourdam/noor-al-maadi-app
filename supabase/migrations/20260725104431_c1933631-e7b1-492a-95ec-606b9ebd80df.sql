CREATE OR REPLACE FUNCTION public.admin_get_campaign_key_art(p_id text)
RETURNS TABLE (
  id text,
  slug text,
  title text,
  key_art_path text,
  key_art_square_path text,
  key_art_credit text,
  key_art_source text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT c.id, c.slug, c.title, c.key_art_path, c.key_art_square_path,
         c.key_art_credit, c.key_art_source
  FROM public.admin_campaigns c
  WHERE c.id = p_id OR c.slug = p_id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_campaign_key_art(
  p_id text,
  p_path text,
  p_square_path text,
  p_credit text,
  p_source text
)
RETURNS TABLE (
  id text,
  key_art_path text,
  key_art_square_path text,
  key_art_credit text,
  key_art_source text
)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  UPDATE public.admin_campaigns c
     SET key_art_path        = NULLIF(btrim(coalesce(p_path, '')), ''),
         key_art_square_path = NULLIF(btrim(coalesce(p_square_path, '')), ''),
         key_art_credit      = NULLIF(btrim(coalesce(p_credit, '')), ''),
         key_art_source      = NULLIF(btrim(coalesce(p_source, '')), ''),
         updated_at          = now()
   WHERE c.id = p_id OR c.slug = p_id
  RETURNING c.id, c.key_art_path, c.key_art_square_path, c.key_art_credit, c.key_art_source;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_campaign_key_art(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_campaign_key_art(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_campaign_key_art(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_campaign_key_art(text, text, text, text, text) TO authenticated;