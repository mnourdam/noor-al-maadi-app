GRANT SELECT, INSERT, UPDATE ON public.investigations TO authenticated;
GRANT ALL ON public.investigations TO service_role;
GRANT SELECT ON public.investigations TO anon;
