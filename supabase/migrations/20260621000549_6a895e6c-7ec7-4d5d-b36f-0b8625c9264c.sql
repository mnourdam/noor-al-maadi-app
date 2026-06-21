DROP POLICY IF EXISTS "Content admin delete investigations" ON public.investigations;
DROP POLICY IF EXISTS "Content admin insert investigations" ON public.investigations;
DROP POLICY IF EXISTS "Content admin update investigations" ON public.investigations;
DROP POLICY IF EXISTS "Public read enabled investigations" ON public.investigations;

CREATE POLICY "Public read enabled investigations" ON public.investigations
  FOR SELECT USING (enabled = true OR lower(coalesce(auth.jwt()->>'email','')) = 'mnourdam@gmail.com');

CREATE POLICY "Admin insert investigations" ON public.investigations
  FOR INSERT TO authenticated
  WITH CHECK (lower(coalesce(auth.jwt()->>'email','')) = 'mnourdam@gmail.com');

CREATE POLICY "Admin update investigations" ON public.investigations
  FOR UPDATE TO authenticated
  USING (lower(coalesce(auth.jwt()->>'email','')) = 'mnourdam@gmail.com')
  WITH CHECK (lower(coalesce(auth.jwt()->>'email','')) = 'mnourdam@gmail.com');

CREATE POLICY "Admin delete investigations" ON public.investigations
  FOR DELETE TO authenticated
  USING (lower(coalesce(auth.jwt()->>'email','')) = 'mnourdam@gmail.com');