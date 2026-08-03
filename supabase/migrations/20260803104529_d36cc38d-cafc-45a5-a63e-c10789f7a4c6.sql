GRANT SELECT ON public.daily_facts TO anon;

CREATE POLICY "anon can read enabled facts"
ON public.daily_facts
FOR SELECT
TO anon
USING (enabled = true);