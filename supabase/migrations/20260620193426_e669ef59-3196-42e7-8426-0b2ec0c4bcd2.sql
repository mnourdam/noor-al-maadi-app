
DROP POLICY IF EXISTS "admin read all encyclopedia" ON public.encyclopedia_entities;
DROP POLICY IF EXISTS "admin insert encyclopedia" ON public.encyclopedia_entities;
DROP POLICY IF EXISTS "admin update encyclopedia" ON public.encyclopedia_entities;
DROP POLICY IF EXISTS "admin delete encyclopedia" ON public.encyclopedia_entities;

CREATE POLICY "admin read all encyclopedia"
  ON public.encyclopedia_entities FOR SELECT
  TO authenticated
  USING (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');

CREATE POLICY "admin insert encyclopedia"
  ON public.encyclopedia_entities FOR INSERT
  TO authenticated
  WITH CHECK (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');

CREATE POLICY "admin update encyclopedia"
  ON public.encyclopedia_entities FOR UPDATE
  TO authenticated
  USING (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com')
  WITH CHECK (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');

CREATE POLICY "admin delete encyclopedia"
  ON public.encyclopedia_entities FOR DELETE
  TO authenticated
  USING (lower(auth.jwt()->>'email') = 'mnourdam@gmail.com');
