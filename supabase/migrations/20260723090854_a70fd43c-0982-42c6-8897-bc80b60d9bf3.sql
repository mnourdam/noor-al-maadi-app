
-- Fix cover upload RLS: allow content editors (owner/admin/editor) to write
-- into the story-media bucket, not only 'admin' role in user_roles.

DROP POLICY IF EXISTS "story_media_admin_insert"  ON storage.objects;
DROP POLICY IF EXISTS "story_media_admin_update"  ON storage.objects;
DROP POLICY IF EXISTS "story_media_admin_delete"  ON storage.objects;

CREATE POLICY "story_media_editor_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'story-media' AND public.is_content_editor());

CREATE POLICY "story_media_editor_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'story-media' AND public.is_content_editor())
  WITH CHECK (bucket_id = 'story-media' AND public.is_content_editor());

CREATE POLICY "story_media_editor_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'story-media' AND public.is_content_editor());
