
-- 1) profiles: drop broad SELECT
DROP POLICY IF EXISTS "Safe columns readable by authenticated" ON public.profiles;

-- ensure own-row select policy exists (kept from before)
-- grant SELECT on public_profiles view for public-facing reads
GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- 2) Replace hardcoded-email admin policies with role-based checks
-- today_in_history_events
DROP POLICY IF EXISTS "admin delete today_in_history_events" ON public.today_in_history_events;
DROP POLICY IF EXISTS "admin insert today_in_history_events" ON public.today_in_history_events;
DROP POLICY IF EXISTS "admin read all today_in_history_events" ON public.today_in_history_events;
DROP POLICY IF EXISTS "admin update today_in_history_events" ON public.today_in_history_events;
CREATE POLICY "editors read all today_in_history_events" ON public.today_in_history_events
  FOR SELECT TO authenticated USING (public.is_content_editor());
CREATE POLICY "editors insert today_in_history_events" ON public.today_in_history_events
  FOR INSERT TO authenticated WITH CHECK (public.is_content_editor());
CREATE POLICY "editors update today_in_history_events" ON public.today_in_history_events
  FOR UPDATE TO authenticated USING (public.is_content_editor()) WITH CHECK (public.is_content_editor());
CREATE POLICY "editors delete today_in_history_events" ON public.today_in_history_events
  FOR DELETE TO authenticated USING (public.is_content_editor());

-- daily_facts
DROP POLICY IF EXISTS "admin delete daily_facts" ON public.daily_facts;
DROP POLICY IF EXISTS "admin insert daily_facts" ON public.daily_facts;
DROP POLICY IF EXISTS "admin read all daily_facts" ON public.daily_facts;
DROP POLICY IF EXISTS "admin update daily_facts" ON public.daily_facts;
CREATE POLICY "editors read all daily_facts" ON public.daily_facts
  FOR SELECT TO authenticated USING (public.is_content_editor());
CREATE POLICY "editors insert daily_facts" ON public.daily_facts
  FOR INSERT TO authenticated WITH CHECK (public.is_content_editor());
CREATE POLICY "editors update daily_facts" ON public.daily_facts
  FOR UPDATE TO authenticated USING (public.is_content_editor()) WITH CHECK (public.is_content_editor());
CREATE POLICY "editors delete daily_facts" ON public.daily_facts
  FOR DELETE TO authenticated USING (public.is_content_editor());

-- encyclopedia_entities
DROP POLICY IF EXISTS "admin delete encyclopedia" ON public.encyclopedia_entities;
DROP POLICY IF EXISTS "admin insert encyclopedia" ON public.encyclopedia_entities;
DROP POLICY IF EXISTS "admin read all encyclopedia" ON public.encyclopedia_entities;
DROP POLICY IF EXISTS "admin update encyclopedia" ON public.encyclopedia_entities;
CREATE POLICY "editors read all encyclopedia" ON public.encyclopedia_entities
  FOR SELECT TO authenticated USING (public.is_content_editor());
CREATE POLICY "editors insert encyclopedia" ON public.encyclopedia_entities
  FOR INSERT TO authenticated WITH CHECK (public.is_content_editor());
CREATE POLICY "editors update encyclopedia" ON public.encyclopedia_entities
  FOR UPDATE TO authenticated USING (public.is_content_editor()) WITH CHECK (public.is_content_editor());
CREATE POLICY "editors delete encyclopedia" ON public.encyclopedia_entities
  FOR DELETE TO authenticated USING (public.is_content_editor());

-- notifications
DROP POLICY IF EXISTS "admin delete notifications" ON public.notifications;
DROP POLICY IF EXISTS "admin insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "admin read all notifications" ON public.notifications;
DROP POLICY IF EXISTS "admin update notifications" ON public.notifications;
CREATE POLICY "managers read all notifications" ON public.notifications
  FOR SELECT TO authenticated USING (public.is_user_manager());
CREATE POLICY "managers insert notifications" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (public.is_user_manager());
CREATE POLICY "managers update notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (public.is_user_manager()) WITH CHECK (public.is_user_manager());
CREATE POLICY "managers delete notifications" ON public.notifications
  FOR DELETE TO authenticated USING (public.is_user_manager());

-- investigations
DROP POLICY IF EXISTS "Admin delete investigations" ON public.investigations;
DROP POLICY IF EXISTS "Admin insert investigations" ON public.investigations;
DROP POLICY IF EXISTS "Admin update investigations" ON public.investigations;
DROP POLICY IF EXISTS "Public read enabled investigations" ON public.investigations;
CREATE POLICY "public read enabled investigations" ON public.investigations
  FOR SELECT USING (enabled = true OR public.is_content_editor());
CREATE POLICY "editors insert investigations" ON public.investigations
  FOR INSERT TO authenticated WITH CHECK (public.is_content_editor());
CREATE POLICY "editors update investigations" ON public.investigations
  FOR UPDATE TO authenticated USING (public.is_content_editor()) WITH CHECK (public.is_content_editor());
CREATE POLICY "editors delete investigations" ON public.investigations
  FOR DELETE TO authenticated USING (public.is_content_editor());

-- 3) user_collection: explicit own-row UPDATE policy
CREATE POLICY "uc_update_own" ON public.user_collection
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
