-- SYNTHETIC CONTRACT ONLY. Not inherited/deployed feedback RLS acceptance.
CREATE TABLE public.user_roles(user_id uuid, role text);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_roles FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.is_feedback_staff(_uid uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_uid AND role='fixture_staff') $$;
CREATE TABLE public.feedback_issues(id uuid PRIMARY KEY, reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL);
CREATE TABLE public.feedback_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),issue_id uuid NOT NULL REFERENCES public.feedback_issues(id) ON DELETE CASCADE,author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,author_role text NOT NULL,body text NOT NULL,is_internal boolean NOT NULL,attachments jsonb NOT NULL DEFAULT '[]');
ALTER TABLE public.feedback_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_issues,public.feedback_messages FROM PUBLIC,anon,authenticated;
