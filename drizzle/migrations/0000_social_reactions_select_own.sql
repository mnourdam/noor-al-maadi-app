REVOKE TRUNCATE ON public.social_reactions FROM authenticated;
DROP POLICY IF EXISTS reactions_select_authenticated ON public.social_reactions;
CREATE POLICY reactions_select_own ON public.social_reactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);