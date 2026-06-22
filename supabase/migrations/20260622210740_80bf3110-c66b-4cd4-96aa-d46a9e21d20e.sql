-- Phase 1 — Atlas Entity Schema
-- Single new table: atlas_entities. APS is canonical; encyclopedia link is the only relation.

CREATE TYPE public.atlas_entity_kind AS ENUM (
  'place', 'battle', 'event', 'figure_marker', 'artifact_site', 'region', 'route_point'
);

CREATE TYPE public.atlas_entity_status AS ENUM (
  'draft', 'review', 'published', 'retired'
);

CREATE TABLE public.atlas_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  kind public.atlas_entity_kind NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  aps_x integer NOT NULL,
  aps_y integer NOT NULL,
  aps_verified boolean NOT NULL DEFAULT false,
  aps_verified_by uuid,
  aps_verified_at timestamptz,
  lon double precision,
  lat double precision,
  geo_source text,
  atlas_version text NOT NULL DEFAULT 'v1',
  era text,
  year_start integer,
  year_end integer,
  status public.atlas_entity_status NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  encyclopedia_entity_id uuid REFERENCES public.encyclopedia_entities(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT atlas_entities_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,63}$'),
  CONSTRAINT atlas_entities_aps_x_bounds CHECK (aps_x >= 0 AND aps_x < 14192),
  CONSTRAINT atlas_entities_aps_y_bounds CHECK (aps_y >= 0 AND aps_y < 7088),
  CONSTRAINT atlas_entities_year_order CHECK (
    year_start IS NULL OR year_end IS NULL OR year_start <= year_end
  )
);

CREATE INDEX atlas_entities_status_kind_idx ON public.atlas_entities (status, kind);
CREATE INDEX atlas_entities_encyclopedia_idx ON public.atlas_entities (encyclopedia_entity_id);
CREATE INDEX atlas_entities_aps_idx ON public.atlas_entities (aps_x, aps_y);

-- GRANTs (required — Supabase does NOT grant default privileges on public schema)
GRANT SELECT ON public.atlas_entities TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.atlas_entities TO authenticated;
GRANT ALL ON public.atlas_entities TO service_role;

-- State enforcement + audit trigger
CREATE OR REPLACE FUNCTION public.atlas_entities_enforce_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Touch updated_at on every UPDATE
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at = now();
  END IF;

  -- aps_verified=true requires reviewer + timestamp; stamp them on transition.
  IF NEW.aps_verified = true THEN
    IF NEW.aps_verified_at IS NULL THEN
      NEW.aps_verified_at := now();
    END IF;
    -- aps_verified_by may be NULL only if migration backfill; normal path: set by app.
  ELSE
    -- aps_verified=false clears reviewer fields
    NEW.aps_verified_by := NULL;
    NEW.aps_verified_at := NULL;
  END IF;

  -- Auto-demote published rows whose APS becomes unverified
  IF TG_OP = 'UPDATE'
     AND OLD.aps_verified = true
     AND NEW.aps_verified = false
     AND NEW.status = 'published' THEN
    NEW.status := 'review';
    NEW.published_at := NULL;
  END IF;

  -- Auto-reset verification when APS coords change
  IF TG_OP = 'UPDATE'
     AND (OLD.aps_x <> NEW.aps_x OR OLD.aps_y <> NEW.aps_y)
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

  -- Publication gate: status='published' requires aps_verified=true
  IF NEW.status = 'published' AND NEW.aps_verified = false THEN
    RAISE EXCEPTION 'cannot publish atlas_entity %: aps_verified must be true', NEW.slug;
  END IF;

  -- Stamp published_at on transition to published
  IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
    NEW.published_at := now();
  END IF;

  -- Clear published_at when not published
  IF NEW.status <> 'published' AND TG_OP = 'UPDATE' AND OLD.status = 'published' THEN
    NEW.published_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER atlas_entities_state_trigger
BEFORE INSERT OR UPDATE ON public.atlas_entities
FOR EACH ROW EXECUTE FUNCTION public.atlas_entities_enforce_state();

-- RLS
ALTER TABLE public.atlas_entities ENABLE ROW LEVEL SECURITY;

-- Public read: only published + verified entities are visible
CREATE POLICY "atlas_entities_public_read"
  ON public.atlas_entities
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published' AND aps_verified = true);

-- Admin read: full access for content admin
CREATE POLICY "atlas_entities_admin_read"
  ON public.atlas_entities
  FOR SELECT
  TO authenticated
  USING (public.is_content_admin());

-- Admin write: insert/update/delete only by content admin
CREATE POLICY "atlas_entities_admin_insert"
  ON public.atlas_entities
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_content_admin());

CREATE POLICY "atlas_entities_admin_update"
  ON public.atlas_entities
  FOR UPDATE
  TO authenticated
  USING (public.is_content_admin())
  WITH CHECK (public.is_content_admin());

CREATE POLICY "atlas_entities_admin_delete"
  ON public.atlas_entities
  FOR DELETE
  TO authenticated
  USING (public.is_content_admin() AND status = 'draft');
