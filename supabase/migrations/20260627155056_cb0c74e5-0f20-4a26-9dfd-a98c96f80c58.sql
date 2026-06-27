-- Restore public-readable safe columns policy so player search via public_profiles works.
CREATE POLICY "Safe columns readable by authenticated"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);