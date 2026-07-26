CREATE OR REPLACE FUNCTION public.list_story_relations_v1()
RETURNS TABLE(story_id text, target_type text, target_id text, role text, display_order integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.story_id,
         r.target_type::text,
         r.target_id,
         r.role::text,
         COALESCE(r.display_order, 0)
    FROM public.story_relations r
    JOIN public.stories s ON s.id = r.story_id
   WHERE s.status = 'published'
     AND COALESCE(s.lock_visibility::text, 'visible') <> 'hidden'
     AND r.target_type::text IN ('encyclopedia_entity', 'campaign', 'collection', 'story')
$$;

REVOKE ALL ON FUNCTION public.list_story_relations_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_story_relations_v1() TO anon, authenticated, service_role;