-- Flip campaigns_public to security_invoker=true and lock down base
-- reads to safe columns via column-level GRANTs. Direct SELECT of
-- draft_data / updated_by / last_editor_email / has_unpublished_changes
-- is impossible without either a matching column grant (none exists)
-- or the admin RPC (gated on is_content_admin()).

ALTER VIEW public.campaigns_public SET (security_invoker = true);

-- Column-level SELECT on safe columns only. Table-level SELECT stays
-- REVOKEd from the previous migration so a bare .select('*') fails
-- with a permission error naming the excluded columns.
GRANT SELECT (
  id, slug, title, status, data,
  content_version, published_at, created_at, updated_at
) ON public.admin_campaigns TO anon;

GRANT SELECT (
  id, slug, title, status, data,
  content_version, published_at, created_at, updated_at
) ON public.admin_campaigns TO authenticated;

-- Row-level guard: even for the granted columns, only published rows
-- are visible to non-admin sessions. Admins keep full access via the
-- admin-only RPCs; this policy is defense-in-depth for the view.
CREATE POLICY "public read published campaign columns"
ON public.admin_campaigns FOR SELECT
TO anon
USING (status = 'published');

CREATE POLICY "authenticated read published campaign columns"
ON public.admin_campaigns FOR SELECT
TO authenticated
USING (status = 'published' OR public.is_content_admin());