-- READ: anyone (anon + authenticated) can read objects in this bucket.
-- Runtime resolver signs URLs on demand; the bucket itself stays private.
CREATE POLICY "campaign_key_art read anon"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'campaign-key-art');

CREATE POLICY "campaign_key_art read authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'campaign-key-art');

-- WRITE: content admins only.
CREATE POLICY "campaign_key_art insert admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-key-art' AND public.is_content_admin());

CREATE POLICY "campaign_key_art update admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'campaign-key-art' AND public.is_content_admin())
  WITH CHECK (bucket_id = 'campaign-key-art' AND public.is_content_admin());

CREATE POLICY "campaign_key_art delete admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-key-art' AND public.is_content_admin());