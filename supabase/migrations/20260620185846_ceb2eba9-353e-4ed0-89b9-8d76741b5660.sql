
-- Admin-only write policies for content tables (daily_facts, today_in_history_events).
-- Uses get_my_email() to check the signed-in user against the admin allowlist.

CREATE OR REPLACE FUNCTION public.is_content_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce(public.get_my_email(), '')) = 'mnourdam@gmail.com';
$$;

-- daily_facts: admin can read all (including disabled), insert, update, delete
CREATE POLICY "admin can read all daily_facts"
  ON public.daily_facts FOR SELECT TO authenticated
  USING (public.is_content_admin());

CREATE POLICY "admin can insert daily_facts"
  ON public.daily_facts FOR INSERT TO authenticated
  WITH CHECK (public.is_content_admin());

CREATE POLICY "admin can update daily_facts"
  ON public.daily_facts FOR UPDATE TO authenticated
  USING (public.is_content_admin())
  WITH CHECK (public.is_content_admin());

CREATE POLICY "admin can delete daily_facts"
  ON public.daily_facts FOR DELETE TO authenticated
  USING (public.is_content_admin());

-- today_in_history_events: admin write policies (read is already public)
CREATE POLICY "admin can read all today_in_history_events"
  ON public.today_in_history_events FOR SELECT TO authenticated
  USING (public.is_content_admin());

CREATE POLICY "admin can insert today_in_history_events"
  ON public.today_in_history_events FOR INSERT TO authenticated
  WITH CHECK (public.is_content_admin());

CREATE POLICY "admin can update today_in_history_events"
  ON public.today_in_history_events FOR UPDATE TO authenticated
  USING (public.is_content_admin())
  WITH CHECK (public.is_content_admin());

CREATE POLICY "admin can delete today_in_history_events"
  ON public.today_in_history_events FOR DELETE TO authenticated
  USING (public.is_content_admin());
