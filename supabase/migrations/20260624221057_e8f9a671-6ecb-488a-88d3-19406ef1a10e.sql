
-- 1) admin_campaigns: remove transitional write policy, add admin-only writes,
--    and restrict non-admin reads to published rows.
DROP POLICY IF EXISTS "transitional anyone can write campaigns" ON public.admin_campaigns;
DROP POLICY IF EXISTS "authenticated read all campaigns" ON public.admin_campaigns;

CREATE POLICY "authenticated read published campaigns"
  ON public.admin_campaigns
  FOR SELECT
  TO authenticated
  USING (status = 'published' OR public.is_content_admin());

CREATE POLICY "admin insert campaigns"
  ON public.admin_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_content_admin());

CREATE POLICY "admin update campaigns"
  ON public.admin_campaigns
  FOR UPDATE
  TO authenticated
  USING (public.is_content_admin())
  WITH CHECK (public.is_content_admin());

CREATE POLICY "admin delete campaigns"
  ON public.admin_campaigns
  FOR DELETE
  TO authenticated
  USING (public.is_content_admin());


-- 2) content_registry: remove transitional write policy, add admin-only writes.
--    Public read remains intentional (registry is shared content metadata).
DROP POLICY IF EXISTS "transitional anyone can write registry" ON public.content_registry;

CREATE POLICY "admin insert registry"
  ON public.content_registry
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_content_admin());

CREATE POLICY "admin update registry"
  ON public.content_registry
  FOR UPDATE
  TO authenticated
  USING (public.is_content_admin())
  WITH CHECK (public.is_content_admin());

CREATE POLICY "admin delete registry"
  ON public.content_registry
  FOR DELETE
  TO authenticated
  USING (public.is_content_admin());


-- 3) automatic_notification_runs: admin-only SELECT.
DROP POLICY IF EXISTS "authenticated can read automatic runs" ON public.automatic_notification_runs;

CREATE POLICY "admin read automatic runs"
  ON public.automatic_notification_runs
  FOR SELECT
  TO authenticated
  USING (public.is_content_admin());


-- 4) notification_deliveries: hide raw push tokens; admin-only SELECT.
DROP POLICY IF EXISTS "Users can read their own delivery rows" ON public.notification_deliveries;

CREATE POLICY "admin read delivery rows"
  ON public.notification_deliveries
  FOR SELECT
  TO authenticated
  USING (public.is_content_admin());


-- 5) SECURITY DEFINER hygiene: revoke anon EXECUTE on functions that should
--    only be callable by signed-in users. We intentionally keep authenticated
--    EXECUTE on the user-scoped helpers because each one scopes work by
--    auth.uid() and raises when unauthenticated.
REVOKE EXECUTE ON FUNCTION public.set_my_display_name(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_content_admin() FROM anon;
