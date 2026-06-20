
-- ============================================================
-- Admin campaigns + content registry
-- JSONB-backed: schema-stable while chapter/activity shapes evolve.
-- ============================================================

CREATE TABLE public.admin_campaigns (
  id           text PRIMARY KEY,
  slug         text,
  title        text NOT NULL,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  data         jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.content_registry (
  id           text PRIMARY KEY,
  type         text NOT NULL,
  name         text NOT NULL,
  data         jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------- GRANTs (required for PostgREST/Data API) ----------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_campaigns  TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_campaigns  TO authenticated;
GRANT ALL                              ON public.admin_campaigns  TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_registry TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.content_registry TO authenticated;
GRANT ALL                              ON public.content_registry TO service_role;

-- ---------- RLS ----------
ALTER TABLE public.admin_campaigns  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_registry ENABLE ROW LEVEL SECURITY;

-- Public reads: only published campaigns are visible to anon;
-- authenticated users see drafts too (admin panel will move under auth later).
CREATE POLICY "public read published campaigns"
  ON public.admin_campaigns FOR SELECT
  TO anon
  USING (status = 'published');

CREATE POLICY "authenticated read all campaigns"
  ON public.admin_campaigns FOR SELECT
  TO authenticated
  USING (true);

-- Registry is fully public-read (museum/figure/artifact metadata).
CREATE POLICY "public read registry"
  ON public.content_registry FOR SELECT
  TO anon, authenticated
  USING (true);

-- TRANSITIONAL WRITE POLICIES.
-- The admin panel is currently passcode-gated client-side and uses the
-- anon key. Once an admin role + auth lands, REPLACE these with policies
-- scoped to `has_role(auth.uid(), 'admin')`.
CREATE POLICY "transitional anyone can write campaigns"
  ON public.admin_campaigns FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "transitional anyone can write registry"
  ON public.content_registry FOR ALL
  TO anon, authenticated
  USING (true) WITH CHECK (true);

-- ---------- updated_at triggers (reuse existing helper) ----------
CREATE TRIGGER admin_campaigns_touch_updated_at
  BEFORE UPDATE ON public.admin_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER content_registry_touch_updated_at
  BEFORE UPDATE ON public.content_registry
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Helpful indexes
CREATE INDEX admin_campaigns_status_idx ON public.admin_campaigns(status);
CREATE INDEX content_registry_type_idx  ON public.content_registry(type);
