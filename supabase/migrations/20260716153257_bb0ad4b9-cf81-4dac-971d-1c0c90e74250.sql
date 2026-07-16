-- ============================================================
-- Campaign draft_data exposure hardening
-- ------------------------------------------------------------
-- Prevents draft_data / updated_by / last_editor_email /
-- has_unpublished_changes from leaking to anon or non-admin
-- authenticated users through the Data API.
--
-- Architecture:
--   * REVOKE SELECT on public.admin_campaigns from anon and
--     authenticated. Direct table SELECT via PostgREST is no
--     longer possible for either role, so column-level exposure
--     is impossible regardless of RLS.
--   * Public read surface = view public.campaigns_public
--     (published rows, safe columns only). Owner-runs on purpose
--     so it does not require caller SELECT privileges on the
--     base table (a security_invoker view would need caller
--     grants, which would re-open direct base SELECT). Safety is
--     enforced by the view's WHERE clause and column projection,
--     not by RLS on the base.
--   * Admin access flows exclusively through SECURITY DEFINER
--     RPCs that gate on is_content_admin().
--   * Existing INSERT/UPDATE/DELETE grants + RLS policies for
--     admins are untouched, so /admin/campaigns and
--     /admin/campaign-order writes keep working through their
--     existing RLS-checked paths.
-- ============================================================

-- 1. Drop the SELECT policies that previously exposed the base table.
--    They are no longer needed since we are revoking the table-level
--    SELECT grant, but dropping them removes any confusion.
DROP POLICY IF EXISTS "public read published campaigns" ON public.admin_campaigns;
DROP POLICY IF EXISTS "authenticated read published campaigns" ON public.admin_campaigns;

-- 2. Revoke direct SELECT from anon and authenticated. Writes are
--    still allowed via existing admin-scoped INSERT/UPDATE/DELETE
--    policies, which the corresponding table-level grants continue
--    to permit.
REVOKE SELECT ON public.admin_campaigns FROM anon;
REVOKE SELECT ON public.admin_campaigns FROM authenticated;

-- Make sure service_role still has full access (edge functions / admin RPCs).
GRANT ALL ON public.admin_campaigns TO service_role;

-- 3. Public, published-only view. Safe columns only. Owner-runs so
--    no base-table SELECT grant is needed for callers.
DROP VIEW IF EXISTS public.campaigns_public;
CREATE VIEW public.campaigns_public AS
SELECT
  id,
  slug,
  title,
  status,
  data,
  content_version,
  published_at,
  created_at,
  updated_at
FROM public.admin_campaigns
WHERE status = 'published';

COMMENT ON VIEW public.campaigns_public IS
  'Public/player-safe projection of admin_campaigns. Excludes draft_data, '
  'updated_by, last_editor_email, has_unpublished_changes. Only status=published rows. '
  'Owner-runs (not security_invoker) so anon/authenticated do not need SELECT on the base table.';

REVOKE ALL ON public.campaigns_public FROM PUBLIC;
GRANT SELECT ON public.campaigns_public TO anon;
GRANT SELECT ON public.campaigns_public TO authenticated;
GRANT ALL ON public.campaigns_public TO service_role;

-- 4. Admin-only RPC: full row for the editor / draft preview.
CREATE OR REPLACE FUNCTION public.admin_get_campaign_full(p_id text)
RETURNS SETOF public.admin_campaigns
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.admin_campaigns WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_campaign_full(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_get_campaign_full(text) TO authenticated;
COMMENT ON FUNCTION public.admin_get_campaign_full(text) IS
  'Admin-only. Returns the full admin_campaigns row (including draft_data). '
  'Gated on is_content_admin(); raises 42501 (Forbidden) for non-admins.';

-- 5. Admin-only RPC: list every row for scan / integrity / list views.
CREATE OR REPLACE FUNCTION public.admin_list_campaigns_full()
RETURNS SETOF public.admin_campaigns
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_content_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.admin_campaigns ORDER BY updated_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_campaigns_full() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_campaigns_full() TO authenticated;
COMMENT ON FUNCTION public.admin_list_campaigns_full() IS
  'Admin-only. Returns every admin_campaigns row (any status), ordered by updated_at DESC. '
  'Gated on is_content_admin(); raises 42501 (Forbidden) for non-admins.';