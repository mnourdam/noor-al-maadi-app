
-- Allow draft atlas rows without coordinates so we can auto-create one per
-- eligible encyclopedia entity and place them later.
ALTER TABLE public.atlas_entities ALTER COLUMN aps_x DROP NOT NULL;
ALTER TABLE public.atlas_entities ALTER COLUMN aps_y DROP NOT NULL;

-- Refresh enforcement trigger:
--  * null-safe coordinate compare via IS DISTINCT FROM
--  * publishing requires APS coords set AND verified
CREATE OR REPLACE FUNCTION public.atlas_entities_enforce_state()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at = now();
  END IF;

  IF NEW.aps_verified = true THEN
    IF NEW.aps_verified_at IS NULL THEN
      NEW.aps_verified_at := now();
    END IF;
  ELSE
    NEW.aps_verified_by := NULL;
    NEW.aps_verified_at := NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.aps_verified = true
     AND NEW.aps_verified = false
     AND NEW.status = 'published' THEN
    NEW.status := 'review';
    NEW.published_at := NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (OLD.aps_x IS DISTINCT FROM NEW.aps_x OR OLD.aps_y IS DISTINCT FROM NEW.aps_y)
     AND NEW.aps_verified = true
     AND OLD.aps_verified = true THEN
    NEW.aps_verified := false;
    NEW.aps_verified_by := NULL;
    NEW.aps_verified_at := NULL;
    IF NEW.status = 'published' THEN
      NEW.status := 'review';
      NEW.published_at := NULL;
    END IF;
  END IF;

  IF NEW.status = 'published' AND (NEW.aps_verified = false OR NEW.aps_x IS NULL OR NEW.aps_y IS NULL) THEN
    RAISE EXCEPTION 'cannot publish atlas_entity %: needs APS coordinates and verification', NEW.slug;
  END IF;

  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;

  IF NEW.status <> 'published' AND TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    NEW.published_at := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- Bulk-create a draft atlas row for every eligible encyclopedia entity
-- that does not yet have one linked. Coordinates left NULL; status=draft;
-- aps_verified=false. Never publishes, never verifies, never guesses APS.
-- Atlas table stores only spatial/visibility data — name_ar is copied solely
-- as a non-authoritative display label; the encyclopedia remains the single
-- source of truth via encyclopedia_entity_id.
CREATE OR REPLACE FUNCTION public.ensure_atlas_drafts_for_encyclopedia()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted_count int := 0;
  eligible_types text[] := ARRAY['state','city','battle','landmark','event'];
  type_to_kind jsonb := jsonb_build_object(
    'state','region','city','place','battle','battle','landmark','artifact_site','event','event'
  );
BEGIN
  IF NOT public.is_content_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  WITH candidates AS (
    SELECT e.id, e.slug, e.entity_type, e.title
    FROM public.encyclopedia_entities e
    WHERE e.enabled = true
      AND e.entity_type = ANY(eligible_types)
      AND NOT EXISTS (
        SELECT 1 FROM public.atlas_entities a
        WHERE a.encyclopedia_entity_id = e.id
      )
  ),
  with_slug AS (
    SELECT id, entity_type, title,
      -- ensure slug uniqueness against existing atlas_entities
      CASE
        WHEN NOT EXISTS (SELECT 1 FROM public.atlas_entities a WHERE a.slug = c.slug)
          THEN c.slug
        ELSE c.slug || '-' || substr(c.id::text, 1, 8)
      END AS slug
    FROM candidates c
  ),
  ins AS (
    INSERT INTO public.atlas_entities (
      slug, kind, name_ar, aps_x, aps_y, aps_verified, status, encyclopedia_entity_id
    )
    SELECT
      s.slug,
      (type_to_kind ->> s.entity_type)::public.atlas_entity_kind,
      s.title,
      NULL, NULL, false, 'draft', s.id
    FROM with_slug s
    ON CONFLICT (slug) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO inserted_count FROM ins;

  RETURN jsonb_build_object('ok', true, 'inserted', inserted_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_atlas_drafts_for_encyclopedia() TO authenticated;
