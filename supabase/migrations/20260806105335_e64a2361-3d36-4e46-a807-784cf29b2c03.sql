GRANT SELECT ON public.investigations TO authenticated;
GRANT SELECT ON public.investigations TO service_role;
GRANT SELECT ON public.investigations_public TO authenticated;
GRANT SELECT ON public.investigations_public TO service_role;
GRANT ALL ON public.investigations TO service_role;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT ON public.user_roles TO service_role;