-- Grant SELECT privilege to anon (guest) and authenticated roles
GRANT SELECT ON public.story_collections TO anon;
GRANT SELECT ON public.story_collections TO authenticated;

-- Create Public Read policy for story_collections
CREATE POLICY "story_collections_public_read"
  ON public.story_collections FOR SELECT
  TO anon, authenticated
  USING (true);
