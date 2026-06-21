CREATE TABLE public.investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  subtitle text,
  description text,
  difficulty text NOT NULL DEFAULT 'easy',
  reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_entities jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.investigations TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investigations TO authenticated;
GRANT ALL ON public.investigations TO service_role;

ALTER TABLE public.investigations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read enabled investigations"
  ON public.investigations FOR SELECT
  USING (enabled = true OR public.is_content_admin());

CREATE POLICY "Content admin insert investigations"
  ON public.investigations FOR INSERT
  TO authenticated
  WITH CHECK (public.is_content_admin());

CREATE POLICY "Content admin update investigations"
  ON public.investigations FOR UPDATE
  TO authenticated
  USING (public.is_content_admin())
  WITH CHECK (public.is_content_admin());

CREATE POLICY "Content admin delete investigations"
  ON public.investigations FOR DELETE
  TO authenticated
  USING (public.is_content_admin());

CREATE TRIGGER investigations_touch_updated_at
  BEFORE UPDATE ON public.investigations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX investigations_enabled_idx ON public.investigations(enabled);
