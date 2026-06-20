
CREATE POLICY "admin read all notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');

CREATE POLICY "admin insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');

CREATE POLICY "admin update notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');

CREATE POLICY "admin delete notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');
