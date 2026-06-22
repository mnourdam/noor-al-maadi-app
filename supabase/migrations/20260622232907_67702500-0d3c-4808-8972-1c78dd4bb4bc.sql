
CREATE TABLE public.atlas_import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch text NOT NULL,
  kind text NOT NULL,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_import_runs_batch_idx ON public.atlas_import_runs (batch, created_at DESC);

GRANT SELECT, INSERT ON public.atlas_import_runs TO authenticated;
GRANT ALL ON public.atlas_import_runs TO service_role;

ALTER TABLE public.atlas_import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "atlas_import_runs_admin_read" ON public.atlas_import_runs
  FOR SELECT TO authenticated USING (public.is_content_admin());

CREATE POLICY "atlas_import_runs_admin_insert" ON public.atlas_import_runs
  FOR INSERT TO authenticated WITH CHECK (public.is_content_admin());
