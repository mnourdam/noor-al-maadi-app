
CREATE TABLE public.encyclopedia_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('figure','city','battle','state','event','landmark','artifact')),
  slug text NOT NULL,
  title text NOT NULL,
  subtitle text,
  summary text,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, slug)
);

GRANT SELECT ON public.encyclopedia_entities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.encyclopedia_entities TO authenticated;
GRANT ALL ON public.encyclopedia_entities TO service_role;

ALTER TABLE public.encyclopedia_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read enabled encyclopedia"
  ON public.encyclopedia_entities FOR SELECT
  USING (enabled = true);

CREATE POLICY "admin read all encyclopedia"
  ON public.encyclopedia_entities FOR SELECT
  TO authenticated
  USING (public.is_content_admin());

CREATE POLICY "admin insert encyclopedia"
  ON public.encyclopedia_entities FOR INSERT
  TO authenticated
  WITH CHECK (public.is_content_admin());

CREATE POLICY "admin update encyclopedia"
  ON public.encyclopedia_entities FOR UPDATE
  TO authenticated
  USING (public.is_content_admin())
  WITH CHECK (public.is_content_admin());

CREATE POLICY "admin delete encyclopedia"
  ON public.encyclopedia_entities FOR DELETE
  TO authenticated
  USING (public.is_content_admin());

CREATE INDEX idx_encyclopedia_entities_type ON public.encyclopedia_entities (entity_type);
CREATE INDEX idx_encyclopedia_entities_enabled ON public.encyclopedia_entities (enabled);

CREATE TRIGGER trg_encyclopedia_entities_touch
  BEFORE UPDATE ON public.encyclopedia_entities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
