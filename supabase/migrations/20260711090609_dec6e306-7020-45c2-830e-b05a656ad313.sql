
-- 1) Add optional image columns to encyclopedia_entities
ALTER TABLE public.encyclopedia_entities
  ADD COLUMN IF NOT EXISTS image_url    text,
  ADD COLUMN IF NOT EXISTS image_path   text,
  ADD COLUMN IF NOT EXISTS image_credit text,
  ADD COLUMN IF NOT EXISTS image_source text;

-- 2) Storage policies for the encyclopedia-images bucket
-- Public read (bucket is private at the bucket level, but we allow anon SELECT
-- on objects so signed-out visitors can view entity images).
DROP POLICY IF EXISTS "encyclopedia_images_public_read"    ON storage.objects;
DROP POLICY IF EXISTS "encyclopedia_images_editor_insert"  ON storage.objects;
DROP POLICY IF EXISTS "encyclopedia_images_editor_update"  ON storage.objects;
DROP POLICY IF EXISTS "encyclopedia_images_editor_delete"  ON storage.objects;

CREATE POLICY "encyclopedia_images_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'encyclopedia-images');

CREATE POLICY "encyclopedia_images_editor_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'encyclopedia-images' AND public.is_content_editor());

CREATE POLICY "encyclopedia_images_editor_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'encyclopedia-images' AND public.is_content_editor())
  WITH CHECK (bucket_id = 'encyclopedia-images' AND public.is_content_editor());

CREATE POLICY "encyclopedia_images_editor_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'encyclopedia-images' AND public.is_content_editor());
