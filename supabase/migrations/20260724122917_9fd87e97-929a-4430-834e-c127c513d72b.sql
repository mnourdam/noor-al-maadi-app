
ALTER FUNCTION public._story_canonicalize_incoming_v2(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public._story_prereqs_v2(uuid, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public._story_redact_summary_v2(public.stories, boolean, boolean, integer, jsonb, boolean, jsonb) SET search_path = public, pg_temp;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.stories FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.story_scenes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.story_media FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.story_sources FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.story_relations FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.story_collections FROM anon, authenticated;

REVOKE ALL ON public.user_story_progress FROM anon;
REVOKE ALL ON public.user_story_completions FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.user_story_progress FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.user_story_completions FROM authenticated;

GRANT ALL ON public.stories, public.story_scenes, public.story_media,
             public.story_sources, public.story_relations, public.story_collections,
             public.user_story_progress, public.user_story_completions
      TO service_role;
