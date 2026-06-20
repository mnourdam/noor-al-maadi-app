
-- Drop previous policies that relied on is_content_admin()
DROP POLICY IF EXISTS "admin can read all daily_facts" ON public.daily_facts;
DROP POLICY IF EXISTS "admin can insert daily_facts" ON public.daily_facts;
DROP POLICY IF EXISTS "admin can update daily_facts" ON public.daily_facts;
DROP POLICY IF EXISTS "admin can delete daily_facts" ON public.daily_facts;
DROP POLICY IF EXISTS "admin can read all today_in_history_events" ON public.today_in_history_events;
DROP POLICY IF EXISTS "admin can insert today_in_history_events" ON public.today_in_history_events;
DROP POLICY IF EXISTS "admin can update today_in_history_events" ON public.today_in_history_events;
DROP POLICY IF EXISTS "admin can delete today_in_history_events" ON public.today_in_history_events;

-- daily_facts: admin policies via auth.jwt() email
CREATE POLICY "admin read all daily_facts"
  ON public.daily_facts FOR SELECT TO authenticated
  USING (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');

CREATE POLICY "admin insert daily_facts"
  ON public.daily_facts FOR INSERT TO authenticated
  WITH CHECK (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');

CREATE POLICY "admin update daily_facts"
  ON public.daily_facts FOR UPDATE TO authenticated
  USING (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');

CREATE POLICY "admin delete daily_facts"
  ON public.daily_facts FOR DELETE TO authenticated
  USING (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');

-- today_in_history_events: admin policies via auth.jwt() email
CREATE POLICY "admin read all today_in_history_events"
  ON public.today_in_history_events FOR SELECT TO authenticated
  USING (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');

CREATE POLICY "admin insert today_in_history_events"
  ON public.today_in_history_events FOR INSERT TO authenticated
  WITH CHECK (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');

CREATE POLICY "admin update today_in_history_events"
  ON public.today_in_history_events FOR UPDATE TO authenticated
  USING (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');

CREATE POLICY "admin delete today_in_history_events"
  ON public.today_in_history_events FOR DELETE TO authenticated
  USING (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');
